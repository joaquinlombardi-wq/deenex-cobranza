import mongoose from 'mongoose';

// Una fila por local x mes x canal, tal como la entrega la plataforma Deenex.
const VentaSchema = new mongoose.Schema(
  {
    local_id: { type: String, required: true },
    periodo: { type: String, required: true }, // AAAA-MM
    canal: { type: String, enum: ['delivery', 'takeaway'], required: true },
    total_con_iva: { type: Number, required: true }, // ARS, sin costo de envío
    cantidad_pedidos: Number,
  },
  { timestamps: true },
);

VentaSchema.index({ local_id: 1, periodo: 1, canal: 1 }, { unique: true });

export const Venta = mongoose.model('Venta', VentaSchema);
