let map;
let geocoder;
let loadedAddresses = new Set();

const markerIcons = {
    red: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
    blue: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
    yellow: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
    purple: "https://maps.google.com/mapfiles/ms/icons/purple-dot.png",
    green: "https://maps.google.com/mapfiles/ms/icons/green-dot.png"
};

function getMarkerIcon(knockResult) {
    if (!knockResult) return markerIcons.red;
    const resultLower = knockResult.toLowerCase().trim();

    if (resultLower.includes("appointment")) return markerIcons.green;
    if (resultLower.includes("discovery") || resultLower.includes("photo")) return markerIcons.purple;
    if (resultLower.includes("quality")) return markerIcons.yellow;
    if (resultLower.includes("conversation")) return markerIcons.blue;
    return markerIcons.red;
}

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 8,
        center: { lat: 47.6062, lng: -122.3321 }
    });

    geocoder = new google.maps.Geocoder();
    addLegendWidget(map);

    fetchAndAppendLeads();

    setInterval(() => {
        fetchAndAppendLeads();
    }, 15000);
}

function addLegendWidget(map) {
    const legend = document.createElement("div");
    legend.id = "map-legend";
    legend.style.backgroundColor = "#fff";
    legend.style.borderRadius = "8px";
    legend.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
    legend.style.padding = "10px 14px";
    legend.style.margin = "10px";
    legend.style.fontFamily = "Arial, sans-serif";
    legend.style.fontSize = "13px";

    const categories = [
        { name: "No Answer", icon: markerIcons.red },
        { name: "Conversation", icon: markerIcons.blue },
        { name: "Quality Conversation", icon: markerIcons.yellow },
        { name: "Discovery / Photos", icon: markerIcons.purple },
        { name: "Appointment Booked", icon: markerIcons.green }
    ];

    let legendContent = `<strong style="font-size:14px; display:block; margin-bottom:8px; border-bottom:1px solid #ccc; padding-bottom:4px;">Knock Result</strong>`;

    categories.forEach(item => {
        legendContent += `
            <div style="display:flex; align-items:center; margin-bottom:6px;">
                <img src="${item.icon}" style="width:20px; height:20px; margin-right:8px;">
                <span>${item.name}</span>
            </div>
        `;
    });

    legend.innerHTML = legendContent;
    map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(legend);
}

function createMarker(latLng, title, address, knockResult, iconUrl) {
    const marker = new google.maps.Marker({
        position: latLng,
        map: map,
        title: title,
        icon: iconUrl
    });

    const infoWindow = new google.maps.InfoWindow({
        content: `<div style="color:#000; padding:8px; font-family:sans-serif;">
                    <h3 style="margin:0 0 5px 0; font-size:15px; color:#1a73e8;">${title}</h3>
                    <p style="margin:0 0 5px 0; font-size:13px;"><b>Address:</b> ${address}</p>
                    <p style="margin:0; font-size:13px;"><b>Knock Result:</b> ${knockResult}</p>
                  </div>`
    });

    marker.addListener("click", () => {
        infoWindow.open(map, marker);
    });
}

async function fetchAndAppendLeads() {
    try {
        const response = await fetch('/.netlify/functions/api/leads');
        const leads = await response.json();

        if (!Array.isArray(leads) || leads.length === 0) return;

        const newLeads = leads.filter(lead => !loadedAddresses.has(lead.address));
        if (newLeads.length === 0) return;

        newLeads.forEach((lead, index) => {
            if (!lead.address || !lead.knockResult) return;

            loadedAddresses.add(lead.address);

            const leadName = lead.name || "Podio Lead";
            const leadAddress = lead.address;
            const knockResult = lead.knockResult;
            const iconUrl = getMarkerIcon(knockResult);

            if (lead.lat && lead.lng) {
                createMarker({ lat: lead.lat, lng: lead.lng }, leadName, leadAddress, knockResult, iconUrl);
            } else {
                setTimeout(() => {
                    geocoder.geocode({ address: leadAddress }, (results, status) => {
                        if (status === "OK" && results[0]) {
                            createMarker(results[0].geometry.location, leadName, leadAddress, knockResult, iconUrl);
                        }
                    });
                }, index * 500);
            }
        });

    } catch (error) {
        console.error("Error updating map markers:", error);
    }
}

window.initMap = initMap;
