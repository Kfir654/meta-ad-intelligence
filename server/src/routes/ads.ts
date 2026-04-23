import { Router } from 'express';
import { askAds, clusterAds, fetchAds, findCompetitors } from '../controllers/adsController';

const router = Router();

router.post('/fetch-ads', fetchAds);
router.post('/ads/ask', askAds);
router.post('/ads/competitors', findCompetitors);
router.post('/ads/cluster', clusterAds);

export default router;
