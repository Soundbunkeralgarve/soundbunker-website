import { json } from "./lib/http.js";
import { probeCrudeCityInvoiceXpress } from "./lib/invoicexpress.js";
export default async function handler(request,response){
 if(request.method!=="GET")return json(response,{error:"Method not allowed"},405);
 try{return json(response,await probeCrudeCityInvoiceXpress())}
 catch(error){console.error("Crude City InvoiceXpress launch probe failed",error);return json(response,{ok:false},503)}
}
