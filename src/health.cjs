function appVersion() {
  return process.env.APP_VERSION || process.env.GIT_SHA || 'unknown';
}

function healthResponse(ready, version) {
  if (ready) {
    return { statusCode: 200, body: { status: 'ok', version } };
  }

  return { statusCode: 503, body: { status: 'not_ready', version } };
}

module.exports = { appVersion, healthResponse };
