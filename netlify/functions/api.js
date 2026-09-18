const express = require('express');
const axios = require('axios');
const cors = require('cors');
const serverless = require('serverless-http');

const app = express();
const router = express.Router();

app.use(cors());
app.use(express.json());

const PODIO_CLIENT_ID = 'sellerleads-64t6gr';
const PODIO_CLIENT_SECRET = 'nrhu9ywaFPnQ2ltklo2BkRb4BHH0txNXIkZe9eYciGsVpRjCUyDIHdlIhfeFdxkL';
const PODIO_APP_ID = '30311034';
const PODIO_APP_TOKEN = 'f29e52965bd998ed77841c2a453005f2';

let accessToken = '';

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

async function fetchLeads() {
    let allLeads = [];
    if (!accessToken) await authenticatePodio();

    let offset = 0;
    const limit = 200;
    let hasMore = true;

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
                    timeout: 25000
                }
            );

            const items = response.data.items || [];
            const batchProcessed = processItems(items);

            allLeads = allLeads.concat(batchProcessed);

            if (items.length < limit) {
                hasMore = false;
            } else {
                offset += limit;
            }
        } catch (batchError) {
            console.error(`Error fetching offset ${offset}:`, batchError.message);
            hasMore = false;
        }
    }
    return allLeads;
}

router.get('/leads', async (req, res) => {
    try {
        const leads = await fetchLeads();
        res.json(leads);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use('/.netlify/functions/api', router);

module.exports.handler = serverless(app);