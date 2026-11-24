// SPDX-License-Identifier: Apache-2.0
// Driving devices publish held actions. The fixed-step discipline owns dodge
// edge detection, resource costs and all physical effects of these commands.
const menu = Object.freeze(['confirm','pause','back','camera','recover','up','down','left','right']);
const nitro = Object.freeze([...menu,'drift','boost']);
const rocket = Object.freeze([...menu,'assist','boost','dodgeLeft','dodgeRight']);
export const mappedActions = Object.freeze([...nitro,'assist','dodgeLeft','dodgeRight']);
export function drivingActions(mode) {
  if (mode==='rocket') return rocket;
  if (mode===true || mode==='nitro') return nitro;
  if (mode==='preview') return mappedActions;
  return menu;
}
export function drivingCommand(axes, mode, held) {
  if (mode==='rocket') return {...axes,boost:!!held('boost'),assist:!!held('assist'),
    dodge:Number(!!held('dodgeRight'))-Number(!!held('dodgeLeft'))};
  if (mode===true || mode==='nitro') return {...axes,drift:!!held('drift'),boost:!!held('boost')};
  return axes;
}
