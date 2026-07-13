(function initializeTwinPairingProtocol(root) {
  'use strict';

  const protocolTag = 'mars-barn-kited-twin/v1';
  const maxCanonicalBytes = 16_384;
  const maxCanonicalDepth = 16;
  const maxCollectionItems = 256;
  const maxViewerCanonicalBytes = 6 * 1024 * 1024;
  const maxViewerCollectionItems = 10_000;
  const encoder = new TextEncoder();

  function serializeCanonicalValue(
    value,
    depth = 0,
    seen = new Set(),
    collectionLimit = maxCollectionItems
  ) {
    if (depth > maxCanonicalDepth) {
      throw new Error('Kited protocol value is nested too deeply');
    }
    if (value === null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') {
      return JSON.stringify(value);
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error('Kited protocol numbers must be finite');
      }
      return JSON.stringify(value);
    }
    if (typeof value !== 'object') {
      throw new Error('Kited protocol values must be JSON-compatible');
    }
    if (seen.has(value)) {
      throw new Error('Kited protocol values cannot be cyclic');
    }
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        if (value.length > collectionLimit) {
          throw new Error('Kited protocol array is too large');
        }
        const items = [];
        for (let index = 0; index < value.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(value, index)) {
            throw new Error('Kited protocol arrays cannot be sparse');
          }
          items.push(serializeCanonicalValue(
            value[index], depth + 1, seen, collectionLimit
          ));
        }
        if (Object.keys(value).some(key => !/^(0|[1-9]\d*)$/.test(key))) {
          throw new Error('Kited protocol arrays cannot have named properties');
        }
        return `[${items.join(',')}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error('Kited protocol objects must be plain');
      }
      if (Object.getOwnPropertySymbols(value).length) {
        throw new Error('Kited protocol symbols are not supported');
      }
      const keys = Object.keys(value);
      if (keys.length > collectionLimit) {
        throw new Error('Kited protocol object has too many keys');
      }
      const serialized = [];
      for (const key of keys.sort()) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) {
          throw new Error('Kited protocol prototype keys are forbidden');
        }
        if (key.length > 128) {
          throw new Error('Kited protocol object key is too long');
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || descriptor.get || descriptor.set) {
          throw new Error('Kited protocol accessors are forbidden');
        }
        serialized.push(
          `${JSON.stringify(key)}:${serializeCanonicalValue(
            value[key], depth + 1, seen, collectionLimit
          )}`
        );
      }
      return `{${serialized.join(',')}}`;
    } finally {
      seen.delete(value);
    }
  }

  function canonicalJson(value) {
    const canonical = serializeCanonicalValue(value);
    if (encoder.encode(canonical).byteLength > maxCanonicalBytes) {
      throw new Error('Kited protocol payload is too large');
    }
    return canonical;
  }

  function canonicalViewerJson(value) {
    const canonical = serializeCanonicalValue(
      value, 0, new Set(), maxViewerCollectionItems
    );
    if (encoder.encode(canonical).byteLength > maxViewerCanonicalBytes) {
      throw new Error('Viewer protocol payload is too large');
    }
    return canonical;
  }

  function base64UrlEncode(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function base64UrlDecode(value, maximumBytes = 256) {
    if (
      typeof value !== 'string' ||
      !value.length ||
      value.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    ) {
      throw new Error('Invalid base64url value');
    }
    const padded =
      value.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    if (binary.length > maximumBytes) {
      throw new Error('Base64url value is too large');
    }
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  function randomValue(byteLength) {
    if (!root.crypto?.getRandomValues) {
      throw new Error('Web Crypto is unavailable');
    }
    const bytes = new Uint8Array(byteLength);
    root.crypto.getRandomValues(bytes);
    return base64UrlEncode(bytes);
  }

  function randomPairingPin() {
    if (!root.crypto?.getRandomValues) {
      throw new Error('Web Crypto is unavailable');
    }
    const range = 1_000_000;
    const limit = Math.floor(0x1_0000_0000 / range) * range;
    const sample = new Uint32Array(1);
    do {
      root.crypto.getRandomValues(sample);
    } while (sample[0] >= limit);
    return String(sample[0] % range).padStart(6, '0');
  }

  function stripSignatureFields(value) {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value)
    ) {
      return value;
    }
    const result = {};
    for (const key of Object.keys(value)) {
      if (key === 'signature' || key === 'viewerSignature') continue;
      result[key] = value[key];
    }
    return result;
  }

  function canonicalChallenge(challenge) {
    return canonicalJson({
      protocolTag,
      challengeId: challenge?.challengeId,
      challenge: challenge?.challenge,
      pairingPin: challenge?.pairingPin,
      twinId: challenge?.twinId,
      viewerInstanceId: challenge?.viewerInstanceId,
      viewerApprovalCommitment: challenge?.viewerApprovalCommitment,
      viewerKeyId: challenge?.viewerKeyId,
      viewerPublicKeyJwk: challenge?.viewerPublicKeyJwk,
      runId: challenge?.runId,
    });
  }

  function protocolFields(message, { requireSignature = true } = {}) {
    const twinIds = [message?.twinId].filter(value => value !== undefined);
    const sequences = [message?.sequence].filter(
      value => value !== undefined
    );
    const signatures = [message?.signature].filter(
      value => value !== undefined
    );
    const provided = Boolean(
      twinIds.length || sequences.length || signatures.length
    );
    if (!provided) return { provided: false, id: null, actor: null };
    if (
      !twinIds.length ||
      !sequences.length ||
      (requireSignature && !signatures.length)
    ) {
      return {
        provided: true,
        error: 'Kited attribution requires twinId, sequence, and signature',
      };
    }
    if (
      twinIds.some(value => value !== twinIds[0]) ||
      sequences.some(value => value !== sequences[0]) ||
      signatures.some(value => value !== signatures[0]) ||
      typeof twinIds[0] !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(twinIds[0])
    ) {
      return { provided: true, error: 'Invalid kited twin attribution' };
    }
    if (!Number.isSafeInteger(sequences[0]) || sequences[0] <= 0) {
      return {
        provided: true,
        error: 'Kited twin sequence must be a positive integer',
      };
    }
    if (
      requireSignature &&
      (typeof signatures[0] !== 'string' || !signatures[0].length)
    ) {
      return { provided: true, error: 'Invalid kited twin signature' };
    }
    return {
      provided: true,
      id: twinIds[0],
      sequence: sequences[0],
      signature: signatures[0] || null,
    };
  }

  function canonicalCommand(message, context) {
    const fields = protocolFields(message, { requireSignature: false });
    if (!fields.provided || fields.error) {
      throw new Error(fields.error || 'Kited command attribution is missing');
    }
    if (
      typeof message?.id !== 'string' ||
      !message.id.length ||
      message.id.length > 128 ||
      /[\u0000-\u001f\u007f]/.test(message.id)
    ) {
      throw new Error('Kited command request id is invalid');
    }
    if (
      typeof message.cmd !== 'string' ||
      !message.cmd.length ||
      message.cmd.length > 64
    ) {
      throw new Error('Kited command name is invalid');
    }
    if (
      !context ||
      typeof context.viewerInstanceId !== 'string' ||
      typeof context.runId !== 'string' ||
      typeof context.pairingChallengeId !== 'string'
    ) {
      throw new Error('Kited command context is missing');
    }
    const rawPayload =
      message.payload === undefined ? null : message.payload;
    canonicalJson(rawPayload);
    return canonicalJson({
      protocolTag,
      viewerInstanceId: context.viewerInstanceId,
      runId: context.runId,
      pairingChallengeId: context.pairingChallengeId,
      command: message.cmd,
      requestId: message.id,
      twinId: fields.id,
      sequence: fields.sequence,
      payload: rawPayload,
    });
  }

  function canonicalViewerMessage(message) {
    if (
      !message ||
      typeof message.cmd !== 'string' ||
      !message.cmd.length ||
      message.cmd.length > 64
    ) {
      throw new Error('Viewer message command is invalid');
    }
    if (
      typeof message.viewerInstanceId !== 'string' ||
      !message.viewerInstanceId.length ||
      message.viewerInstanceId.length > 128 ||
      typeof message.runId !== 'string' ||
      !message.runId.length ||
      message.runId.length > 128 ||
      typeof message.pairingChallengeId !== 'string' ||
      !message.pairingChallengeId.length ||
      message.pairingChallengeId.length > 128 ||
      typeof message.viewerKeyId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,64}$/.test(message.viewerKeyId)
    ) {
      throw new Error('Viewer message context is invalid');
    }
    if (
      typeof message.targetTwinId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/.test(message.targetTwinId)
    ) {
      throw new Error('Viewer message target is invalid');
    }
    if (
      !Number.isSafeInteger(message.viewerSequence) ||
      message.viewerSequence <= 0
    ) {
      throw new Error('Viewer message sequence must be a positive integer');
    }
    if (
      message.replyTo !== undefined &&
      (
        typeof message.replyTo !== 'string' ||
        !message.replyTo.length ||
        message.replyTo.length > 128 ||
        /[\u0000-\u001f\u007f]/.test(message.replyTo)
      )
    ) {
      throw new Error('Viewer message correlation id is invalid');
    }
    const rawPayload =
      message.payload === undefined ? null : message.payload;
    canonicalViewerJson(rawPayload);
    return canonicalViewerJson({
      protocolTag,
      viewerInstanceId: message.viewerInstanceId,
      runId: message.runId,
      pairingChallengeId: message.pairingChallengeId,
      viewerKeyId: message.viewerKeyId,
      targetTwinId: message.targetTwinId,
      viewerSequence: message.viewerSequence,
      command: message.cmd,
      requestId: message.replyTo ?? null,
      payload: rawPayload,
    });
  }

  root.TwinPairingProtocol = Object.freeze({
    protocolTag,
    canonicalJson,
    canonicalChallenge,
    canonicalCommand,
    canonicalViewerMessage,
    protocolFields,
    stripSignatureFields,
    base64UrlEncode,
    base64UrlDecode,
    randomValue,
    randomPairingPin,
    async sha256Base64Url(value) {
      if (!root.crypto?.subtle || typeof value !== 'string') {
        throw new Error('Web Crypto is unavailable');
      }
      const digest = await root.crypto.subtle.digest(
        'SHA-256', encoder.encode(value)
      );
      return base64UrlEncode(digest);
    },
    encodeText(value) {
      return encoder.encode(value);
    },
  });
})(globalThis);
