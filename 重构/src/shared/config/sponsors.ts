export interface Sponsor {
  name: string;
  message: string;
  amount: string | number;
  date?: string;
  avatar?: string;
}

export const sponsors: Sponsor[] = [
  {
    name: "应萧",
    message: "什么都没有说捏",
    amount: "¥200.00"
  },
  {
    name: "Lighthouse",
    message: "什么都没有说捏",
    amount: "¥100.00"
  },
  {
    name: "裁汰",
    message: "什么都没有说捏",
    amount: "¥100.00"
  },
  {
    name: "穹",
    message: "什么都没有说捏",
    amount: "¥100.00"
  },
  {
    name: "lk小李同学",
    message: "什么都没有说捏",
    amount: "¥50.00"
  },
  {
    name: "Elysia",
    message: "什么都没有说捏",
    amount: "¥50.00"
  },
  {
    name: "xiaocha",
    message: "什么都没有说捏",
    amount: "¥35.00"
  },
  {
    name: "咕咕咕 (veryvegetable)",
    message: "什么都没有说捏",
    amount: "¥33.61"
  },
  {
    name: "nighttalk团队",
    message: "什么都没有说捏",
    amount: "¥10.00"
  },
  {
    name: "大宽",
    message: "什么都没有说捏",
    amount: "¥10.00"
  },
  {
    name: "蓝草莓",
    message: "什么都没有说捏",
    amount: "¥7.00"
  },
  {
    name: "WBD",
    message: "什么都没有说捏",
    amount: "¥5.00"
  },
  {
    name: "TvT",
    message: "什么都没有说捏",
    amount: "¥5.00"
  }
];

export const sponsorConfig = {
  title: "赞助鸣谢",
  subtitle: "感谢每一位支持 StarMC 的伙伴，你们的支持是我们前进的动力",
  currencySymbol: "¥"
};
