import {requireUser} from './lib/supabase-auth.js';
import {json,parseJson} from './lib/http.js';
import {createPartnerBookingsHandler} from './lib/partner-bookings.js';

export default createPartnerBookingsHandler({requireUser,json,parseJson});
