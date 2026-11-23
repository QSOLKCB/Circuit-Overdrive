// SPDX-License-Identifier: Apache-2.0
// IDs are stable throughout simulation, contact resolution and classification.
export const PLAYER_ID = 5;
export const FIELD = Object.freeze([
  {id:0, name:'Mara Vale',  number:14, color:'#3979ee', style:'leader'},
  {id:1, name:'Kit Vega',   number:83, color:'#ffad24', style:'aggressor'},
  {id:2, name:'Emi Park',   number:46, color:'#12bdaf', style:'technician'},
  {id:3, name:'Rory Flint', number:59, color:'#ba65da', style:'defender'},
  {id:4, name:'Luca Reed',  number:32, color:'#92cf38', style:'rookie'},
  {id:5, name:'Player',     number:27, color:'#ef4333', style:'player'},
].map(Object.freeze));
