import mongoose from 'mongoose';

const { Schema } = mongoose;
const sinId = { _id: false };

const Contacto = new Schema({ nombre: String, email: String, telefono: String }, sinId);

const Franquiciado = new Schema(
  {
    id: { type: String, required: true },
    razonSocial: { type: String, required: true },
    cuit: { type: String, required: true },
    condicionIva: String,
    domicilioFiscal: String,
    contacto: Contacto,
  },
  sinId,
);

const Local = new Schema(
  {
    id: { type: String, required: true },
    nombre: { type: String, required: true },
    plataformaId: String, // id del local en la plataforma Deenex, para cruzar las ventas
    tipo: { type: String, enum: ['propio', 'franquiciado'], required: true },
    franquiciadoId: String,
    alta: { type: String, required: true }, // AAAA-MM-DD
    baja: String,
    precio: Number, // precio propio, pisa el del acuerdo
  },
  sinId,
);

const Acuerdo = new Schema(
  {
    vigenciaDesde: { type: String, required: true }, // AAAA-MM
    moneda: { type: String, enum: ['USD', 'ARS'], default: 'USD' },
    ajusteIpc: { activo: Boolean, mesBase: String },
    feePorLocal: { precio: Number, precioPropio: Number, precioFranquiciado: Number },
    comision: { delivery: Number, takeaway: Number }, // tasas: 0.03 = 3%
    feeFijo: { monto: Number, detalle: String },
    combinacion: { modo: { type: String, enum: ['suma', 'mayor', 'tope'], default: 'suma' }, tope: Number },
    prorrateo: { modo: { type: String, enum: ['completo', 'proporcional', 'corte'], default: 'completo' }, dia: Number },
  },
  sinId,
);

const Extra = new Schema(
  {
    concepto: { type: String, required: true },
    tipo: { type: String, enum: ['hosting', 'servidores', 'desarrollo', 'reintegro', 'feeFijo'], required: true },
    monto: { type: Number, required: true },
    moneda: { type: String, enum: ['USD', 'ARS'], default: 'USD' },
    conIva: { type: Boolean, default: true },
    desde: String,
    hasta: String,
    cuotas: { total: Number, primera: String },
    pagador: { type: String, default: 'marca' }, // 'marca' o id de franquiciado
  },
  sinId,
);

const ClienteSchema = new Schema(
  {
    id: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    razonSocial: String,
    cuit: String,
    condicionIva: String,
    domicilioFiscal: String,
    contacto: Contacto,
    quienPaga: { type: String, enum: ['marca', 'franquiciados'], default: 'marca' },
    franquiciados: [Franquiciado],
    locales: [Local],
    acuerdos: [Acuerdo],
    extras: [Extra],
  },
  { timestamps: true },
);

export const Cliente = mongoose.model('Cliente', ClienteSchema);
