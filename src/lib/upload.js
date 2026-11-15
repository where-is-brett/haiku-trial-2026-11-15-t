// src/lib/upload.js
const NO_FILE = 'Choose a statement file';
const TOO_LARGE = 'The file is larger than 5 MB';

// Raised for an upload that cannot be read. `status` is the HTTP status to send.
export class UploadError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

// Reads a multipart upload whose body is at most maxBytes, and returns the text
// of its `statement` file. Bytes are counted as they arrive; past the cap the
// reading stops and a 413 is raised.
export async function readUpload(req, { maxBytes }) {
  const buffer = await readBody(req, maxBytes);

  let form;
  try {
    const contentType = req.headers['content-type'] ?? '';
    form = await new Response(buffer, { headers: { 'content-type': contentType } }).formData();
  } catch {
    throw new UploadError(NO_FILE, 400);
  }

  const file = form.get('statement');
  if (!(file instanceof Blob)) throw new UploadError(NO_FILE, 400);
  return file.text();
}

// Collects the request body, or rejects once it passes maxBytes.
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    const onData = (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.off('data', onData);
        req.pause();
        reject(new UploadError(TOO_LARGE, 413));
        return;
      }
      chunks.push(chunk);
    };

    req.on('data', onData);
    req.on('end', () => resolve(Buffer.concat(chunks, total)));
    req.on('error', reject);
  });
}
