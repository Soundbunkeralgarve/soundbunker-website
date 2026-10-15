// Keep scanner traffic beside the Ireland database, including existing app builds.
// The shared proxy and upstream retain their verified-account and staff checks.
import proxy from './[endpoint].js';
export default function handler(req,res){
 req.query={...req.query,endpoint:'event-scan'};
 return proxy(req,res);
}
