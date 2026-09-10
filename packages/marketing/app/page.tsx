import LandingPage from './landing/LandingPage';
import { APP_URL, withAttributionFromSearch } from './lib/appLinks';

type SearchParams = Record<string, string | string[] | undefined>;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <LandingPage
      initialLoginHref={withAttributionFromSearch(`${APP_URL}/`, params)}
      initialSignupHref={withAttributionFromSearch(`${APP_URL}/criar-conta`, params)}
    />
  );
}
