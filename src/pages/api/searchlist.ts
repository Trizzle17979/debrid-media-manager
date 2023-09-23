import { PlanetScaleCache } from '@/services/planetscale';
import { ScrapeInput } from '@/services/scrapeInput';
import { ScrapeResponse, generateScrapeJobs } from '@/services/scrapeJobs';
import { NextApiRequest, NextApiResponse } from 'next';

const db = new PlanetScaleCache();

export default async function handler(req: NextApiRequest, res: NextApiResponse<ScrapeResponse>) {
	const { scrapePassword, search, olderThanMins, skipMs } = req.query;
	if (process.env.SCRAPE_API_PASSWORD && scrapePassword !== process.env.SCRAPE_API_PASSWORD) {
		res.status(403).json({
			status: 'error',
			errorMessage: 'You are not authorized to use this feature',
		});
		return;
	}
	if (!search || typeof search !== 'string') {
		res.status(400).json({
			status: 'error',
			errorMessage: 'You must provide a search term',
		});
		return;
	}

	const scrapeInput = new ScrapeInput();

	for await (let listId of scrapeInput.byLists(search)) {
		for await (let imdbId of scrapeInput.byListId(listId)) {
			const isProcessing = await db.keyExists(`processing:${imdbId}`);
			if (isProcessing) {
				console.log(`[searchlist] Already processing ${imdbId}, skipping`);
				continue;
			}
			if (!(await db.isOlderThan(imdbId, parseInt(olderThanMins as string) || 60 * 24))) {
				console.log(`[searchlist] ${imdbId} was scraped recently, skipping`);
				await new Promise((resolve) =>
					setTimeout(resolve, parseInt(skipMs as string) || 1000)
				);
				continue;
			}
			await generateScrapeJobs(res, imdbId, true);
		}
	}
}