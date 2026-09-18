const axios = require('axios');

let cachedLeads = [];
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

exports.handler = async (event, context) => {
    try {
        const now = Date.now();
        if (cachedLeads.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cachedLeads)
            };
        }

        const PODIO_CLIENT_ID = process.env.PODIO_CLIENT_ID;
        const PODIO_CLIENT_SECRET = process.env.PODIO_CLIENT_SECRET;
        const PODIO_APP_ID = process.env.PODIO_APP_ID;
        const PODIO_APP_TOKEN = process.env.PODIO_APP_TOKEN;

        // 1. Authenticate with Podio
        const authResponse = await axios.post('https://api.podio.com/oauth/token', {
            grant_type: 'app',
            app_id: PODIO_APP_ID,
            app_token: PODIO_APP_TOKEN,
            client_id: PODIO_CLIENT_ID,
            client_secret: PODIO_CLIENT_SECRET
        });

        const accessToken = authResponse.data.access_token;

        // 2. Fetch all items using pagination loop (Chunks of 100)
        let allItems = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        while (hasMore) {
            const itemsResponse = await axios.post(
                `https://api.podio.com/item/app/${PODIO_APP_ID}/filter/`,
                { limit: limit, offset: offset },
                {
                    headers: {
                        'Authorization': `OAuth2 ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const items = itemsResponse.data.items || [];
            allItems = allItems.concat(items);

            if (items.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        }

        // 3. Map leads data
        const mappedLeads = allItems.map(item => {
            let name = item.title || "No Name";
            let address = "";
            let knockResult = "No Answer";

            item.fields.forEach(field => {
                if (field.type === "location" && field.values.length > 0) {
                    address = field.values[0].formatted || field.values[0].value;
                }
                if (field.label === "Knock Result" && field.values.length > 0) {
                    knockResult = field.values[0].value.text;
                }
            });

            return { name, address, knockResult };
        }).filter(lead => lead.address !== "");

        cachedLeads = mappedLeads;
        lastFetchTime = now;

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cachedLeads)
        };

    } catch (error) {
        console.error("Podio API Error:", error.response ? error.response.data : error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch data from Podio" })
        };
    }
};
