const https = require('https');

const token = "2820a19c-6d76-4e70-8c79-0804cd08ed0d";

const data = JSON.stringify({
    query: `
    query {
      projects {
        edges {
          node {
            name
            services {
              edges {
                node {
                  name
                  serviceInstances {
                    edges {
                      node {
                        domains {
                          serviceDomains {
                            domain
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `
});

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
        try {
            const json = JSON.parse(body);
            if (json.errors) {
                console.error("GraphQL Errors:", JSON.stringify(json.errors, null, 2));
            } else {
                console.log(JSON.stringify(json, null, 2));
            }
        } catch (e) {
            console.error("Parse Error:", e);
            console.log("Raw Body:", body);
        }
    });
});

req.on('error', error => {
    console.error("Request Error:", error);
});

req.write(data);
req.end();
