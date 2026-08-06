import { readFileSync } from 'fs';
import crypto from 'crypto';
import { connectDB, User, Invitation } from '../db/index.js';

await connectDB();

const calendar = JSON.parse(readFileSync('./data/sofascore/calendar.json', 'utf8'));
const jugadores = JSON.parse(readFileSync('./data/sofascore/jugadores.json', 'utf8'));

const ALL_AVATARS = [
  '⚽', '🥅', '🧤', '🏟️', '🎯',
  '🏆', '🥇', '🥈', '🥉', '🏅', '⚡', '🎽', '🏃', '🚴', '🏊',
  '🦁', '🐯', '🐺', '🦅', '🐙', '🐉', '🦄', '🐵', '🐶', '🐱', '🐼', '🦊', '🐮', '🐷',
  '😎', '🤓', '🤡', '👽', '🤖', '😈', '🥳', '😤', '🤯', '💪', '🫡', '🫠', '🤌', '✌️', '🤘',
  '🔥', '⭐', '💎', '🎮', '🎸', '🌈',
];

const taken = ['🎸', '🐺', '👽', '🤘'];
const available = ALL_AVATARS.filter(a => !taken.includes(a));

const funnyNamesByAvatar = {
  '⚽': ['PelotaMaster', 'Golpeador', 'TiroLibre99', 'ChilenaKing'],
  '🥅': ['PorteroFeliz', 'SinBanana', 'RedGoal', 'Parador99'],
  '🧤': ['ManosFrias', 'GuanteLoco', 'ManosDeOro', 'GlovesMagic'],
  '🏟️': ['EstadioVacio', 'TribunaLoca', 'CampNouFan', 'SantiagoBB'],
  '🎯': ['DianaPerfecta', 'TiroAlBlanco', 'PrecisionMax', 'SniperGoal'],
  '🏆': ['TrofeoHunter', 'CopaGang', 'ChampionForever', 'WinnerCup'],
  '🥇': ['OroPuro', 'PrimeroDeTodo', 'GoldRush', 'Medalla1'],
  '🥈': ['PlataNoEsMal', 'Subcampeon', 'SilverLining', 'SegundoPlat'],
  '🥉': ['BronceEterno', 'TerceroFeliz', 'BronzeAge', 'PodiumKing'],
  '🏅': ['Medallista', 'Deportista', 'OlimpicoFan', 'MedalMania'],
  '⚡': ['RayoMcQueen', 'Velocista', 'ThunderGoal', 'FlashKicker'],
  '🎽': ['Camiseta10', 'NumeroDiez', 'KitPlayer', 'UniformeLoco'],
  '🏃': ['CorreGol', 'Maratonista', 'SpeedyGonzalez', 'RunnerUp'],
  '🚴': ['CiclistaFC', 'BiciGol', 'Pedaleando', 'MountainBike'],
  '🏊': ['NadadorFC', 'Acuatico', 'SwimGoal', 'WaterPlayer'],
  '🦁': ['LeonDeMilan', 'RoarGoal', 'SelvaViva', 'KingLion'],
  '🐯': ['TigreAsiatico', 'StripesGoal', 'TigerForce', 'FerociousFC'],
  '🐺': ['LoboSolitario', 'PackLeader', 'WolfGoal', 'HowlingFC'],
  '🦅': ['AguilaReal', 'FlyHigh', 'BirdOfPrey', 'EagleEye'],
  '🐙': ['PulpoKing', 'OctopusGoal', 'TentaclesFC', 'InkMaster'],
  '🐉': ['DragonFC', 'Dragonesa', 'FireBreath', 'DragonBall'],
  '🦄': ['UnicornioFC', 'MagicoGoal', 'HornPower', 'RainbowKicker'],
  '🐵': ['MonoLoco', 'ChimpFC', 'BananaGoal', 'MonkeyBiz'],
  '🐶': ['PerritoFC', 'DogGoal', 'BarkBark', 'PawKicker'],
  '🐱': ['GatitoFC', 'MeowGoal', 'CatPower', 'PurrfectFC'],
  '🐼': ['PandaFC', 'BambooGoal', 'BlackWhite', 'PandaPower'],
  '🦊': ['ZorroFC', 'FoxGoal', 'AstutoKicker', 'CleverFox'],
  '🐮': ['VacaLoca', 'ToroFC', 'MooGoal', 'BullPower'],
  '🐷': ['CerdoFC', 'PigGoal', 'OinkOink', 'HamsterKicker'],
  '😎': ['CoolGoal', 'Suavecito', 'FrescoCool', 'ChillFC'],
  '🤓': ['NerdFC', 'GeekGoal', 'InteligenFC', 'SmartKicker'],
  '🤡': ['PayasoFC', 'CircusGoal', 'FunnyKicker', 'ClownPower'],
  '🤖': ['RobotFC', 'MecanicoGoal', 'AndroidKicker', 'CyborgFC'],
  '😈': ['DiablitoFC', 'DevilGoal', 'HornedKicker', 'MischiefFC'],
  '🥳': ['FiestaFC', 'PartyGoal', 'Celebracion', 'HappyKicker'],
  '😤': ['EnfadadoFC', 'AngryGoal', 'FuriaKicker', 'RagePower'],
  '🤯': ['CabezaExplota', 'MindBlown', 'ExplosionFC', 'CrazyKicker'],
  '💪': ['MusculosoFC', 'FuerteGoal', 'PowerKicker', 'StrongFC'],
  '🫡': ['SoldadoFC', 'SaludoGoal', 'ObedienteFC', 'SargentKicker'],
  '🫠': ['DerretidoFC', 'MeltingGoal', 'SoftKicker', 'LiquidFC'],
  '🤌': ['ChePuzone', 'ItalianoFC', 'BesitosGoal', 'ChefKicker'],
  '✌️': ['PazGoal', 'VictoryFC', 'PeaceKicker', 'DosDedos'],
  '🔥': ['FuegoFC', 'FireGoal', 'FlameKicker', 'BurningFC'],
  '⭐': ['EstrellaFC', 'StarGoal', 'SuperStar', 'Galactico'],
  '💎': ['DiamanteFC', 'JewelGoal', 'PreciousKicker', 'CrystalFC'],
  '🎮': ['GamerFC', 'PlayStation', 'XboxGoal', 'NintendoKicker'],
  '🌈': ['ArcoIrisFC', 'RainbowGoal', 'ColorKicker', 'PrismaFC'],
};

const eventIds = calendar.map(m => m.id);

const porteros = jugadores.filter(j => j.posicion === 'G');
const defensas = jugadores.filter(j => j.posicion === 'D');
const centrocampistas = jugadores.filter(j => j.posicion === 'M');
const delanteros = jugadores.filter(j => j.posicion === 'F');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomScore() {
  return Math.floor(Math.random() * 5);
}

const users = [];
const usedAvatars = [];
const usedNames = [];

for (let i = 0; i < 20; i++) {
  let avatar;
  do {
    avatar = available[Math.floor(Math.random() * available.length)];
  } while (usedAvatars.includes(avatar));
  usedAvatars.push(avatar);

  const names = funnyNamesByAvatar[avatar] || ['DefaultFC'];
  let username;
  do {
    username = names[Math.floor(Math.random() * names.length)];
  } while (usedNames.includes(username));
  usedNames.push(username);

  const clave = Math.random().toString(36).substring(2, 8).toUpperCase();

  const numPredictions = Math.floor(Math.random() * 21) + 20;
  const shuffledEvents = shuffle(eventIds);
  const predictions = {};
  for (let j = 0; j < numPredictions; j++) {
    predictions[shuffledEvents[j]] = {
      home: randomScore(),
      away: randomScore()
    };
  }

  const usedClubs = new Set();
  const squad = [];

  const shuffledG = shuffle(porteros);
  for (let j = 0; j < shuffledG.length && squad.filter(x => x.posicion === 'G').length < 3; j++) {
    const p = shuffledG[j];
    if (!usedClubs.has(p.club)) {
      squad.push({ ...p, extension: 'webp' });
      usedClubs.add(p.club);
    }
  }

  const shuffledD = shuffle(defensas);
  for (let j = 0; j < shuffledD.length && squad.filter(x => x.posicion === 'D').length < 8; j++) {
    const p = shuffledD[j];
    if (!usedClubs.has(p.club)) {
      squad.push({ ...p, extension: 'webp' });
      usedClubs.add(p.club);
    }
  }

  const shuffledM = shuffle(centrocampistas);
  for (let j = 0; j < shuffledM.length && squad.filter(x => x.posicion === 'M').length < 8; j++) {
    const p = shuffledM[j];
    if (!usedClubs.has(p.club)) {
      squad.push({ ...p, extension: 'webp' });
      usedClubs.add(p.club);
    }
  }

  const shuffledF = shuffle(delanteros);
  for (let j = 0; j < shuffledF.length && squad.filter(x => x.posicion === 'F').length < 6; j++) {
    const p = shuffledF[j];
    if (!usedClubs.has(p.club)) {
      squad.push({ ...p, extension: 'webp' });
      usedClubs.add(p.club);
    }
  }

  users.push({ clave, username, avatar, predictions, squad });
}

console.log('Users to create:');
users.forEach(u => console.log(`  ${u.username} | ${u.avatar} | ${u.clave} | squad:${u.squad.length} | preds:${Object.keys(u.predictions).length}`));

let created = 0;
for (const userData of users) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync('test123', salt, 64).toString('hex');
  const passwordHash = salt + ':' + hash;

  await User.create({
    clave: userData.clave,
    username: userData.username,
    passwordHash,
    avatar: userData.avatar,
    predictions: userData.predictions,
    squad: userData.squad,
    createdAt: new Date()
  });

  await Invitation.create({
    code: userData.clave,
    usedBy: userData.username,
    createdAt: new Date()
  });

  created++;
}

console.log(`\nDone! Created ${created} users and invitations.`);
console.log('All passwords are: test123');
process.exit(0);
