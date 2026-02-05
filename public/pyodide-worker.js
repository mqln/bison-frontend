/**
 * Pyodide Web Worker for running Python simulation in the browser.
 */

importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

let pyodide = null;
let simulationLoaded = false;

async function initPyodide() {
  postMessage({ type: "status", message: "Loading Pyodide..." });

  pyodide = await loadPyodide();

  postMessage({ type: "status", message: "Loading NumPy and SciPy..." });

  // Load required packages
  await pyodide.loadPackage(["numpy", "scipy"]);

  postMessage({ type: "status", message: "Loading simulation code..." });

  // Fetch and run simulation.py
  const simResponse = await fetch("/simulation.py");
  const simCode = await simResponse.text();
  await pyodide.runPythonAsync(simCode);

  postMessage({ type: "status", message: "Loading biomass data..." });

  // Fetch biomass data
  const dataResponse = await fetch("/data/biomass.npz");
  const dataBuffer = await dataResponse.arrayBuffer();

  // Load npz in Python
  const uint8Array = new Uint8Array(dataBuffer);
  pyodide.globals.set("_npz_bytes", uint8Array);

  await pyodide.runPythonAsync(`
import numpy as np
import io

# Load npz from bytes
npz_data = np.load(io.BytesIO(bytes(_npz_bytes)))
biomass = npz_data['biomass']
cell_size_km = float(npz_data['cell_size_km'][0])

# Initialize data
result = load_data(biomass, cell_size_km)
print(f"Loaded biomass: {result}")
  `);

  simulationLoaded = true;
  postMessage({ type: "ready" });
}

async function handleMessage(event) {
  const { type, payload } = event.data;

  if (type === "init") {
    await initPyodide();
    return;
  }

  if (!simulationLoaded) {
    postMessage({ type: "error", error: "Simulation not loaded yet" });
    return;
  }

  try {
    let result;

    switch (type) {
      case "start":
        const { row, col, totalPopulation } = payload;
        result = await pyodide.runPythonAsync(
          `start_simulation(${row}, ${col}, ${totalPopulation})`
        );
        postMessage({ type: "state", data: JSON.parse(result) });
        break;

      case "step":
        const years = payload?.years || 1;
        result = await pyodide.runPythonAsync(`step_simulation(${years})`);
        postMessage({ type: "state", data: JSON.parse(result) });
        break;

      case "getInitialBiomass":
        result = await pyodide.runPythonAsync(`
import json
json.dumps({
    'biomass': _biomass_data.tolist(),
    'width': _biomass_data.shape[1],
    'height': _biomass_data.shape[0],
    'cell_size_km': _cell_size_km
})
        `);
        postMessage({ type: "initialBiomass", data: JSON.parse(result) });
        break;

      default:
        postMessage({ type: "error", error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    postMessage({ type: "error", error: error.message });
  }
}

onmessage = handleMessage;
