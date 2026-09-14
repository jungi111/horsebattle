// 정산 계산 (순수 함수). 방장 기기와 나중의 서버(회원제)에서 같은 코드를 쓸 수 있게 분리.

export const BET_AMOUNTS = [1000, 5000, 10000];
export const BET_TYPES = { win: '단승', place: '연승' };

/** 배팅 하나가 적중했는지 */
export function isHit(bet, order) {
  const rank = order.indexOf(bet.horse);
  if (rank < 0) return false;
  return bet.type === 'win' ? rank === 0 : rank <= 2;
}

/** 배팅 하나의 순지급액(+배당 or -배팅액) */
export function netOf(bet, order) {
  return isHit(bet, order) ? Math.floor(bet.amount * bet.odds) - bet.amount : -bet.amount;
}

/**
 * 한 경주의 모든 배팅을 정산한다.
 * @param {Record<string, {horse:number,type:string,amount:number,odds:number}>} bets  pid → 배팅
 * @param {number[]} order  도착 순서(idx)
 * @returns {Record<string, {rank:number, hit:boolean, pay:number, net:number}>}
 */
export function settle(bets, order) {
  const out = {};
  Object.entries(bets || {}).forEach(([pid, b]) => {
    const rank = order.indexOf(b.horse);
    const hit = isHit(b, order);
    const pay = hit ? Math.floor(b.amount * b.odds) : 0;
    out[pid] = { rank, hit, pay, net: pay - b.amount };
  });
  return out;
}
