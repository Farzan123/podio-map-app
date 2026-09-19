const axios = require('axios');

let cachedLeads = [];
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 60 * 1000;

module.exports = async (req, res) => {
    try {
        const now = Date.now();
        if (cachedLeads.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
            return res.status(200).json(cachedLeads);
        }

        const PODIO_CLIENT_ID = process.env.PODIO_CLIENT_ID;
        const PODIO_CLIENT_SECRET = process.env.PODIO_CLIENT_SECRET;
        const PODIO_APP_ID = process.env.PODIO_APP_ID;
        const PODIO_APP_TOKEN = process.env.PODIO_APP_TOKEN;

        // 1. OAuth Token Request
        const params = new URLSearchParams();
        params.append('grant_type', 'app');
        params.append('app_id', PODIO_APP_ID);
        params.append('app_token', PODIO_APP_TOKEN);
        params.append('client_id', PODIO_CLIENT_ID);
        params.append('client_secret', PODIO_CLIENT_SECRET);

        const authResponse = await axios.post('https://api.podio.com/oauth/token', params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const accessToken = authResponse.data.access_token;

        // 2. Fetch Items
        const itemsResponse = await axios.post(
            `https://api.podio.com/item/app/${PODIO_APP_ID}/filter/`,
            { limit: 100, offset: 0 },
            {
                headers: {
                    'Authorization': `OAuth2 ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const items = itemsResponse.data.items || [];

        // 3. Map & Filter Records
        const mappedLeads = items.map(item => {
            let name = item.title || "No Name";
            let address = "";
            let knockResult = "";

            if (item.fields) {
                item.fields.forEach(field => {
                    if (field.type === "location" && field.values && field.values.length > 0) {
                        address = field.values[0].formatted || field.values[0].value;
                    }
                    if (field.label === "Knock Result" && field.values && field.values.length > 0) {
                        knockResult = field.values[0].value.text || field.values[0].value;
                    }
                });
            }

            return { name, address, knockResult };
        }).filter(lead => lead.address !== "" && lead.knockResult !== "");

        cachedLeads = mappedLeads;
        lastFetchTime = now;

        return res.status(200).json(cachedLeads);

    } catch (error) {
        console.error("Podio API Error Details:", error.response ? error.response.data : error.message);
        return res.status(500).json({
            error: "Failed to fetch data from Podio",
            details: error.response ? error.response.data : error.message
        });
    }
};
