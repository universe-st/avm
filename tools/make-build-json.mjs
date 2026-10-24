#!/usr/bin/env node
/**
 * 从 cordova/keys/keystore.properties 生成 cordova/build.json（含密码，已 gitignore）。
 * 仓库里永远不出现明文密码；CI 用环境变量覆盖。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const propsPath = join(ROOT, 'cordova/keys/keystore.properties');
const outPath = join(ROOT, 'cordova/build.json');

const props = {};
for (const line of readFileSync(propsPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const index = trimmed.indexOf('=');
  if (index <= 0) continue;
  props[trimmed.slice(0, index)] = trimmed.slice(index + 1);
}

const required = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'];
for (const key of required) {
  if (!props[key]) throw new Error(`keystore.properties 缺少 ${key}`);
}

const config = {
  android: {
    release: {
      keystore: `keys/${props.storeFile}`,
      storePassword: props.storePassword,
      alias: props.keyAlias,
      password: props.keyPassword,
      keystoreType: props.keystoreType ?? 'pkcs12',
      packageType: 'apk',
    },
  },
};

writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf-8', mode: 0o600 });
console.log(`[android] wrote ${outPath.replace(ROOT + '/', '')} (secrets omitted from logs)`);
