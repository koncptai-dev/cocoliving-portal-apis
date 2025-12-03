// middleware/rawBody.js
/**
 * rawBody middleware
 * Must run before bodyParser.json() for webhook route in app.js
 * Captures raw buffer and string on req.rawBody and req.rawBodyString
 */
module.exports = function rawBody(req, res, next) {
  const chunks = [];
  req.on('data', (chunk) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      req.rawBody = buffer;
      req.rawBodyString = buffer.toString('utf8');
    } catch (err) {
      req.rawBody = undefined;
      req.rawBodyString = undefined;
      console.error('rawBody middleware parse error', err);
    }
    next();
  });

  req.on('error', (err) => {
    console.error('rawBody request error', err);
    next(err);
  });
};
