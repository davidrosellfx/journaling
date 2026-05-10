// El Google Sheet de origen calcula los € a partir del % usando un capital
// base fijo de 50.000 €. Cuando importamos desde Apps Script (que devuelve €),
// usamos esta misma constante para recuperar el % real.
//
// Si en el futuro el sheet del usuario cambia su capital base, solo hay que
// actualizar este número.
export const SHEET_CONVERSION_FACTOR = 50000;
