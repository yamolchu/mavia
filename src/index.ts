const { random } = require('user-agents');
const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const fs = require('fs');
const { HCaptchaTask } = require('node-capmonster');
const { Worker, workerData, isMainThread } = require('worker_threads');

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const config = require('../inputs/config.ts');
const csvWriter = createCsvWriter({
  path: './result.csv',
  header: [
    { id: 'email', title: 'Email' },
    { id: 'proxy', title: 'Proxy' },
    { id: 'discord', title: 'Discord' },
  ],
  append: true,
});

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}
const numThreads = config.numThreads;
const customDelay = config.customDelay;

function parseEmails(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const emails: { email: string; imapPass: string }[] = [];

  lines.forEach((line: string) => {
    const [email = '', imapPass = ''] = line.split(':');
    emails.push({ email: email.trim(), imapPass: imapPass.trim() });
  });

  return emails;
}
function parseProxies(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const proxies: string[] = [];

  lines.forEach((line: string) => {
    const proxy = line.trim();
    proxies.push(proxy);
  });

  return proxies;
}
function parseDiscords(filePath: string) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const discords: string[] = [];

  lines.forEach((line: string) => {
    const [discord = ''] = line.split(':');
    discords.push(discord.trim());
  });

  return discords;
}
const emails = parseEmails('./inputs/emails.txt');
const proxies = parseProxies('./inputs/proxies.txt');
const discords = parseDiscords('./inputs/discords.txt');

async function reg(email: any, proxy: string, discord: string) {
  const client = new HCaptchaTask(config.captchaAPIKey);
  const task = client.task({
    websiteKey: '1d32f899-7e34-4124-9dfb-8f6b0fc89754',
    websiteURL: 'https://www.mavia.com/waitlist2',
  });
  const taskId = await client.createWithTask(task);
  const result = await client.joinTaskResult(taskId);
  const headers = {
    'user-agent': random().toString(),
    authority: 'backend.prod.haqqex.tech',
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9,uk;q=0.8',
    'content-type': 'application/json',
    origin: 'https://www.mavia.com',
    referer: 'https://www.mavia.com',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    captcha: result.gRecaptchaResponse,
  };
  const session = axios.create({
    headers: headers,
    httpsAgent:
      config.proxyType === 'http' ? new HttpsProxyAgent(`http://${proxy}`) : new SocksProxyAgent(`socks5://${proxy}`),
  });

  const data = {
    email: email.email,
    referralId: Number(config.ref),
    captcha: result.gRecaptchaResponse,
    discordName: discord,
  };
  const res = await session.post('https://be.mavia.com/api/wait-list', data);
  console.log(res.data);
  const resultData = [
    {
      email: email.email,
      proxy: proxy,
      discord: discord,
    },
  ];
  await csvWriter
    .writeRecords(resultData)
    .then(() => {
      console.log('CSV file has been saved.');
    })
    .catch((error: any) => {
      console.error(error);
    });
}

function regRecursive(emails: any, proxies: any, discords: any, index = 0, numThreads = 4) {
  if (index >= emails.length) {
    return;
  }

  const worker = new Worker(__filename, {
    workerData: { email: emails[index], proxy: proxies[index], discord: discords[index] },
  });
  worker.on('message', (message: any) => {
    console.log(message);
  });
  worker.on('error', (error: any) => {
    console.error(error);
  });
  worker.on('exit', (code: any) => {
    if (code !== 0) {
      console.error(`Thread Exit ${code}`);
    }
    regRecursive(emails, proxies, discords, index + numThreads, numThreads);
  });
}
const main = async () => {
  if (isMainThread) {
    for (let i = 0; i < numThreads; i++) {
      await delay(customDelay);
      regRecursive(emails, proxies, discords, i, numThreads);
    }
  } else {
    await delay(customDelay);
    const { email, proxy, discord } = workerData;
    reg(email, proxy, discord);
  }
};
main();
