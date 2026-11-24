# Damage and driving condition

Each laboratory car starts with eight integers at zero. Front, rear, left and right describe the struck panels. Engine, steering, tyres and suspension describe mechanical condition. Each field saturates at 1000. Rebuilding the experiment creates fresh bodies and a fresh contact latch. Panel compression leaves the collision envelope fixed.

The v1.1.1 candidate's scene reads the four cumulative panel integers for each car and derives the visible bodywork from them. The render path writes only its own mesh state. Reset and replay rebuild the same clean or damaged surface from the ledger at the displayed tick. [Computational impact panels](computational-impact-panels.md)

On contact entry, take the smaller of normal energy and measured kinetic loss, divided equally among the damageable cars. Subtract a 1,500 J allowance, divide by 1,200 J per point, round down and clamp at zero. The first point therefore requires 2,700 J per car. The struck panel receives this severity. Multiply it by the coefficients below and round down for each component. The receipt stores the actual increment after saturation. Persistent constraint impulses carry empty damage increments. Summing a car’s receipt increments reproduces its damage exactly.

| Face | Engine | Steering | Tyres | Suspension |
| --- | ---: | ---: | ---: | ---: |
| Front | .90 | .38 | .23 | .44 |
| Rear | .08 | 0 | .22 | .36 |
| Left or right | 0 | .28 | .72 | .58 |

At maximum component damage, available longitudinal acceleration falls from 12 to 3 m/s², steering yaw demand to 35%, lateral tyre damping to 32% and yaw damping to 40%. The suspension channel represents a planar yaw-settling approximation. Engine or tyre saturation disables drive immediately. Brakes and restart remain available. A damaged car otherwise keeps the same state and drives with these factors until this trial ends. The lab-owned force adapter reads the validated chassis recipe and never edits the touring recipe. Its road is level and continuously supported. The coefficients express deterministic arcade handling and carry no real-world safety interpretation.
