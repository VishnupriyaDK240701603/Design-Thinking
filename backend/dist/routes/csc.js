"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cscRouter = void 0;
const express_1 = require("express");
const db_1 = require("../db");
exports.cscRouter = (0, express_1.Router)();
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}
function deg2rad(deg) {
    return deg * (Math.PI / 180);
}
exports.cscRouter.get('/nearby', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        const radius = parseFloat(req.query.radius) || 10; // Default 10km
        if (isNaN(lat) || isNaN(lng)) {
            return res.status(400).json({ error: 'Valid lat and lng required' });
        }
        const { data: centres, error } = await db_1.appDb.from('csc_centres').select('*');
        if (error)
            throw error;
        const withDistance = centres.map(center => {
            const distance_km = getDistanceFromLatLonInKm(lat, lng, center.latitude, center.longitude);
            return { ...center, distance_km };
        });
        const nearby = withDistance
            .filter(c => c.distance_km <= radius)
            .sort((a, b) => a.distance_km - b.distance_km);
        return res.json(nearby);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
exports.cscRouter.get('/district/:district', async (req, res) => {
    try {
        const { data, error } = await db_1.appDb
            .from('csc_centres')
            .select('*')
            .eq('district', req.params.district);
        if (error)
            throw error;
        return res.json(data);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
