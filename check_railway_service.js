const https = require('https');

const token = "2820a19c-6d76-4e70-8c79-0804cd08ed0d";
const projectId = "aac72258-4118-4929-80f7-2a9fe6aab2b9";

// Query to get services and their environment variables
const query = `
  query {
    project(id: "${projectId}") {
      services {
        edges {
          node {
            id
            name
            serviceInstances {
              edges {
                node {
                  environmentId
                }
              }
            }
          }
        }
      }
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
