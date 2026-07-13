import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 3199;
const baseUrl = `http://127.0.0.1:${port}`;
const apiKey = 'stage6-smoke-key-at-least-32-characters';
let output = '';

const server = spawn(process.execPath, ['dist/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    SERVER_HOST: '127.0.0.1',
    REQUIRE_API_KEY: 'true',
    API_KEY: apiKey,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-20_000);
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API exited early (${server.exitCode})\n${output}`);
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response;
    } catch {
      // The process may still be binding the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become healthy\n${output}`);
}

try {
  const health = await waitForHealth();
  const healthBody = await health.json();
  assert.equal(healthBody.status, 'ok');
  assert.equal(healthBody.version, '1.0.0');

  const unauthorized = await fetch(`${baseUrl}/jobs`);
  assert.equal(unauthorized.status, 401);

  const invalidJob = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: '' }),
  });
  assert.equal(invalidJob.status, 400);

  console.log('API smoke passed: health, authentication, and validation');
} finally {
  const exitPromise = new Promise((resolve) => {
    if (server.exitCode !== null) resolve(server.exitCode);
    else server.once('exit', resolve);
  });
  if (server.exitCode === null) server.kill('SIGTERM');
  const exited = await Promise.race([
    exitPromise.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!exited && server.exitCode === null) server.kill('SIGKILL');
}
