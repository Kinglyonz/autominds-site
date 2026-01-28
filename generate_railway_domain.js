const https = require('https');

const token = "2820a19c-6d76-4e70-8c79-0804cd08ed0d";
const serviceId = "63e2be61-d818-4fa0-81fd-f164d700acae";
const environmentId = "a71bc7ca-4393-4dc4-bd1f-2fdd9f6782dc";

// Mutation to generate a domain
const query = `
  mutation {
    serviceDomainCreate(input: {
      serviceId: "${serviceId}"
      environmentId: "${environmentId}"
    }) {
      domain
    }
  }
`;

const data = JSON.stringify({ query });

const options = {
  hostname: 'backboard.railway.app',
  port: 443,
  path: '/graphql/v2',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': data.length
  }
};

const req = https.request(options, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
