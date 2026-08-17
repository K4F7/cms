function appVersion() {
  return process.env.APP_VERSION || process.env.GIT_SHA || 'unknown';
}

function imageDigest() {
  return process.env.CMS_IMAGE_DIGEST || process.env.IMAGE_DIGEST || null;
}

function healthResponse(ready, version, digest = imageDigest()) {
  const body = { status: ready ? 'ok' : 'not_ready', version };
  if (digest) {
    body.imageDigest = digest;
  }

  return { statusCode: ready ? 200 : 503, body };
}

module.exports = { appVersion, healthResponse, imageDigest };
