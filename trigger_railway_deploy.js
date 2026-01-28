const https = require('https');

const token = "2820a19c-6d76-4e70-8c79-0804cd08ed0d";

// Trigger deployment for autominds-react service
const serviceId = "3fa1a4f4-9cda-401d-8112-3ae1e9998783";
const environmentId = "ff19689d-0893-42a7-8675-b73ca36e60bf";

const query = `
  mutation {
    serviceInstanceRedeploy(
      serviceId: "${serviceId}"
      environmentId: "${environmentId}"
    )
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

console.log('Triggering Railway redeploy...');

const req = https.request(options, res => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
        const response = JSON.parse(body);
        if (response.data) {
            console.log('✓ Redeploy triggered successfully!');
            console.log('Your site should be live in 1-2 minutes.');
        } else {
            console.log('Response:', JSON.stringify(response, null, 2));
        }
    });
});

req.on('error', error => console.error('Error:', error));
req.write(data);
req.end();
