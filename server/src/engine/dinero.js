import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const D = (v) => new Decimal(v ?? 0);

export const redondear = (v) => D(v).toDecimalPlaces(2);

export const IVA_GENERAL = D('0.21');
