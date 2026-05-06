const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'python', 'run_pipeline.py');

/**
 * Generates a PDF for the given devis data by calling the Python script.
 * @param {object} data — payload matching the Python script's expected format
 * @returns {Promise<Buffer>} raw PDF bytes
 */
function generateDevisPdf(data) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [SCRIPT]);
    const chunks = [];
    const errChunks = [];

    py.stdout.on('data', c => chunks.push(c));
    py.stderr.on('data', c => errChunks.push(c));

    py.on('close', code => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const stderr = Buffer.concat(errChunks).toString();
        reject(new Error(`Python PDF generator exited with code ${code}: ${stderr}`));
      }
    });

    py.on('error', err => reject(new Error(`Failed to spawn python3: ${err.message}`)));

    py.stdin.write(JSON.stringify(data));
    py.stdin.end();
  });
}

module.exports = { generateDevisPdf };
