/**
 * gm-pulse — the operator's lens, as one command.
 *
 * Born mid-party: the GM kept asking the dev session "who's playing? did that
 * land? why is it quiet?" — questions no phone screen answers, because the
 * phone shows the GAME and the operator needs the ROOM. One shot, read-only:
 *
 *   npx tsx scripts/gm-pulse.mts [--room WDKH]
 */
import { readFileSync } from 'fs'
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const pick = (k: string) => env.split('\n').find((l) => l.startsWith(k + '='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const URL_ = pick('VITE_SUPABASE_URL'), KEY = pick('VITE_SUPABASE_ANON_KEY')
const get = async (p: string) => (await fetch(`${URL_}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })).json()

const code = process.argv.includes('--room') ? process.argv[process.argv.indexOf('--room') + 1] : 'WDKH'
const [room] = await get(`rooms?code=eq.${code}&select=*`)
if (!room) { console.error(`room ${code} not found`); process.exit(1) }
const RID = room.id

const players = await get(`players?room_id=eq.${RID}&select=id,name,team,is_host`)
const byId = new Map(players.map((p: {id:string}) => [p.id, p]))
const msgs = await get(`messages?room_id=eq.${RID}&select=player_id,text,created_at&order=created_at.desc&limit=200`)
const winners = await get(`room_winners?room_id=eq.${RID}&select=category_id`)
const cards = await get(`bingo_cards?room_id=eq.${RID}&select=id,player_id`)
const cardOwner = new Map(cards.map((c: {id:string;player_id:string}) => [c.id, c.player_id]))
const marks = await get(`bingo_marks?select=card_id,marked_at&order=marked_at.desc&limit=100`)

const now = Date.now()
const ago = (iso: string) => {
  const m = Math.round((now - new Date(iso).getTime()) / 60000)
  return m < 1 ? 'now' : `${m}m ago`
}

console.log(`\n═══ ${code} · phase ${room.phase} · ${winners.length} events declared ═══\n`)
console.log('PLAYERS — last seen (chat), declares, marks:')
for (const p of players) {
  const lastMsg = msgs.find((m: {player_id:string}) => m.player_id === p.id)
  const declares = msgs.filter((m: {player_id:string;text:string}) =>
    m.player_id === 'winner-divider' && m.text.includes(`called by ${p.name}`)).length
  const myMarks = marks.filter((m: {card_id:string}) => cardOwner.get(m.card_id) === p.id).length
  const team = p.team === 'black' ? 'BLK' : p.team === 'green' ? 'GRN' : ' — '
  console.log(`  ${(p.is_host ? '★' : ' ')} ${p.name.padEnd(16)} ${team}  chat:${lastMsg ? ago(lastMsg.created_at).padEnd(8) : 'never   '} declares:${declares}  marks:${myMarks}`)
}

console.log('\nLAST 6 THINGS THAT HAPPENED:')
const facts = msgs.filter((m: {player_id:string}) => ['winner-divider', 'system'].includes(m.player_id)).slice(0, 6)
for (const f of [...facts].reverse()) console.log(`  ${ago(f.created_at).padEnd(8)} ${f.text.slice(0, 78)}`)

const lastCompanion = msgs.find((m: {player_id:string}) => ['ned','cersei','tyrion','joffrey','daenerys','olenna','arya'].includes(m.player_id))
console.log(`\nCAST: last spoke ${lastCompanion ? ago(lastCompanion.created_at) : 'NEVER'}  (daemon + sentinel run separately — check their task logs)`)
console.log('')
