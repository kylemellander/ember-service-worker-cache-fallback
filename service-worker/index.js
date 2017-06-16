import { PATTERNS, VERSION } from 'ember-service-worker-cache-fallback/service-worker/config';
import 'ember-service-worker-cache-fallback/service-worker/localforage';
import cleanupCaches from 'ember-service-worker/service-worker/cleanup-caches';
import { createUrlRegEx, urlMatchesAnyPattern } from 'ember-service-worker/service-worker/url-utils';

const CACHE_KEY_PREFIX = 'esw-cache-fallback-localforage';
const CACHE_NAME = `${CACHE_KEY_PREFIX}-${VERSION}`;

const PATTERN_REGEX = PATTERNS.map(createUrlRegEx);

self.addEventListener('fetch', (event) => {
  let request = event.request;
  if (request.method !== 'GET' || !/^https?/.test(request.url)) {
    return;
  }

  if (urlMatchesAnyPattern(request.url, PATTERN_REGEX)) {
    event.respondWith(makeRequest(request)
      .then(response => saveResponse(request, response))
      .catch(() => caches.match(event.request))
    )
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupCaches(CACHE_KEY_PREFIX, CACHE_NAME));
});

const saveResponse = (request, response) =>
  response.clone().text().then(raw => {
    const payload = JSON.parse(raw)
    const { data, included } = payload

    if (Array.isArray(data)) {
      data.forEach(record => {
        saveRecord(recordKey(record), record)
      })
    } else if (data) {
      saveRecord(recordKey(data), data)
    }

    if (Array.isArray(included)) {
      included.forEach(record => {
        saveRecord(recordKey(data), data)
      })
    }

    if (request.method === 'GET' && response.ok) {
      saveRequest(request, response, payload)
    }
  }).then(() => response)

const recordKey = record => `${CACHE_NAME}-${record.type}[${record.id}]`
const saveRecord = (key, value) => localforage.setItem(key, value)

const makeRequest = request => new Promise((resolve, reject) => {
  fetch(request).then(resolve)
})

const saveRequest = (request, response, payload) => {
  const data = {
    status: response.status,
    statusText: response.statusText,
    headers: {},
    payload: formatPayloadForCaching(payload)
  }

  response.headers.forEach((value, key) => data.headers[key] = value)

  saveRecord(request.url, data)
}

const formatPayloadForCaching = payload => {
  const { data, included } = payload
  const formattedPayload = assign({}, payload)

  if (Array.isArray(data)) {
    formattedPayload.data = data.map(record => `${record.type}[${record.id}]`)
  } else if (data) {
    formattedPayload.data = `${data.type}[${data.id}]`
  }

  if (Array.isArray(included)) {
    const formattedIncluded = included.map(record =>
      `${record.type}[${record.id}]`
    )

    formattedPayload.included = formattedIncluded
  }

  return formattedPayload
}
