import { test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { limpiarDireccion, queRevisar, sinComillas } from '../src/store/direccionMongo.js';

const ATLAS = 'mongodb+srv://joaco:Abc123xyz@cluster0.ab1cd.mongodb.net/?appName=Cluster0';
const conClave = (clave) => `mongodb+srv://joaco:${clave}@cluster0.ab1cd.mongodb.net/?appName=Cluster0`;

// Lo que entiende el driver de Mongo de la dirección, sin conectarse.
function comoLaLee(uri) {
  const { credentials, srvHost, appName } = new mongoose.mongo.MongoClient(uri).options;
  return { usuario: credentials.username, clave: credentials.password, cluster: srvHost, appName };
}

test('La dirección pegada con comillas, espacios o «MONGODB_URI=» adelante queda limpia', () => {
  assert.equal(limpiarDireccion(`  "${ATLAS}"\n`), ATLAS);
  assert.equal(limpiarDireccion(`'${ATLAS}'`), ATLAS);
  assert.equal(limpiarDireccion(`MONGODB_URI=${ATLAS}`), ATLAS);
  assert.equal(limpiarDireccion(ATLAS), ATLAS);
});

test('Los < > de Atlas y los caracteres especiales de la contraseña se arreglan solos', () => {
  for (const [pegada, clave] of [
    ['<Abc123xyz>', 'Abc123xyz'],
    ['<Clave2026@>', 'Clave2026@'],
    ['Clave2026@', 'Clave2026@'],
    ['a:b/c?d#e[f]g@h%i', 'a:b/c?d#e[f]g@h%i'],
    ['Clave2026%40', 'Clave2026@'],
  ]) {
    assert.deepEqual(comoLaLee(limpiarDireccion(conClave(pegada))), { usuario: 'joaco', clave, cluster: 'cluster0.ab1cd.mongodb.net', appName: 'Cluster0' }, pegada);
  }
});

test('Lo que no tiene contraseña queda como estaba', () => {
  assert.equal(limpiarDireccion('mongodb://localhost:27017/cobranza-dev'), 'mongodb://localhost:27017/cobranza-dev');
  assert.equal(limpiarDireccion('mongodb+srv://cluster0.ab1cd.mongodb.net/'), 'mongodb+srv://cluster0.ab1cd.mongodb.net/');
  assert.equal(limpiarDireccion(''), '');
});

test('La clave para entrar también perdona comillas y espacios', () => {
  assert.equal(sinComillas(' "año-2026" '), 'año-2026');
  assert.equal(sinComillas('año-2026'), 'año-2026');
});

test('Cada error de conexión dice qué revisar', () => {
  const revisar = (mensaje, uri = ATLAS) => queRevisar(new Error(mensaje), uri);
  assert.match(revisar('bad auth : authentication failed'), /Database Users/);
  assert.match(revisar('Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"'), /empezar justo con mongodb\+srv:\/\//);
  assert.match(revisar('querySrv ENOTFOUND _mongodb._tcp.cluster0.ab1cd.mongodb.net'), /después de la @/);
  assert.match(revisar('Could not connect to any servers in your MongoDB Atlas cluster.'), /0\.0\.0\.0\/0, en «Active»/);
  assert.match(revisar('bad auth : authentication failed', conClave('db_password')), /quedó «db_password»/);
  assert.match(revisar('algo que no conozco'), /^Revisá MONGODB_URI/);
});
