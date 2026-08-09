// جدول الجوائز الخاص بعجلة الحظ (عادية / سوبر)
const prizes = {
  normal: [
    { prize: '200k', chance: 50 },
    { prize: '500k', chance: 20 },
    { prize: '750k', chance: 1 },
    { prize: '1M', chance: 0.1 },
    { prize: '10m', chance: 0.00001 },
  ],
  super: [
    { prize: '200k', chance: 50 },
    { prize: '300k', chance: 30 },
    { prize: '400k', chance: 7 },
    { prize: '10m', chance: 0.000000001 },
    { prize: '1m', chance: 0.000000001 },
    { prize: '10m', chance: 0.01 },
    { prize: '8m', chance: 0.00001 },
    { prize: '2m', chance: 0.00001 },
    { prize: '5m', chance: 0.00001 },
  ]
};

function getRandomPrize(type) {
  const list = prizes[type];
  const total = list.reduce((sum, item) => sum + item.chance, 0);
  const random = Math.random() * total;
  let cumulative = 0;
  for (const item of list) {
    cumulative += item.chance;
    if (random <= cumulative) return item.prize;
  }
  return list[list.length - 1].prize;
}

module.exports = { prizes, getRandomPrize };
