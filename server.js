const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const PODIO_CLIENT_ID = 'sellerleads-64t6gr';
const PODIO_CLIENT_SECRET = 'nrhu9ywaFPnQ2ltklo2BkRb4BHH0txNXIkZe9eYciGsVpRjCUyDIHdlIhfeFdxkL';
const PODIO_APP_ID = '30311034';
const PODIO_APP_TOKEN = 'f29e52965bd998ed77841c2a453005f2';

let accessToken = '';
let cachedLeads = [];
let isFetching = false;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function authenticatePodio() {
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'app');
        params.append('client_id', PODIO_CLIENT_ID);
        params.append('client_secret', PODIO_CLIENT_SECRET);
        params.append('app_id', PODIO_APP_ID);
        params.append('app_token', PODIO_APP_TOKEN);

        const response = await axios.post('https://podio.com/oauth/token', params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        accessToken = response.data.access_token;
        console.log('Podio authenticated successfully!');
    } catch (error) {
        console.error('Error authenticating with Podio:', error.response ? error.response.data : error.message);
    }
}

function processItems(items) {
    return items.map(item => {
        let address = "";
        let lat = null;
        let lng = null;
        let knockResult = "";
        let name = item.title || "Podio Lead";

        item.fields.forEach(field => {
            if (field.external_id === "property-address-map" || field.label === "Property Address") {
                if (field.values && field.values.length > 0) {
                    const val = field.values[0];
                    address = val.formatted || val.value || "";
                    if (val.lat && val.lng) {
                        lat = parseFloat(val.lat);
                        lng = parseFloat(val.lng);
                    }
                }
            }

            if (field.external_id === "knock-result" || field.label === "Knock Result") {
                if (field.values && field.values.length > 0) {
                    const val = field.values[0].value;
                    if (typeof val === 'object' && val !== null) {
                        knockResult = val.text || val.title || "";
                    } else if (typeof val === 'string') {
                        knockResult = val;
                    }
                }
            }

            if (field.external_id === "seller-name" || field.label === "Seller Name") {
                if (field.values && field.values.length > 0) {
                    name = field.values[0].value || name;
                }
            }
        });

        return { name, address, lat, lng, knockResult: knockResult.trim() };
    }).filter(lead => lead.address !== "" && lead.knockResult !== "" && lead.knockResult.toLowerCase() !== "uncategorized");
}

async function refreshLeadsCache() {
    if (isFetching) return;
    isFetching = true;
    cachedLeads = [];

    try {
        if (!accessToken) await authenticatePodio();

        let offset = 0;
        const limit = 200;
        let hasMore = true;

        console.log("Background Job Started: Syncing all leads from Podio...");

        while (hasMore) {
            try {
                const response = await axios.post(
                    `https://api.podio.com/item/app/${PODIO_APP_ID}/filter/`,
                    { limit: limit, offset: offset },
                    {
                        headers: {
                            'Authorization': `OAuth2 ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000
                    }
                );

                const items = response.data.items || [];
                const batchProcessed = processItems(items);

                cachedLeads = cachedLeads.concat(batchProcessed);
                console.log(`Fetched offset: ${offset} | Total in cache: ${cachedLeads.length}`);

                if (items.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                    await sleep(150);
                }
            } catch (batchError) {
                console.error(`Error fetching offset ${offset}, retrying...`, batchError.message);
                await sleep(1000);
            }
        }

        console.log(`SUCCESS: Cached ${cachedLeads.length} valid categorized leads!`);
    } catch (error) {
        console.error("Cache refresh error:", error.message);
    } finally {
        isFetching = false;
    }
}

app.get('/api/leads', (req, res) => {
    res.json(cachedLeads);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    refreshLeadsCache();
});