import type { Problem } from '../domain/Problem';
import { MVP_RUBRIC_ID } from './rubric';

/**
 * The four seeded problems.
 *
 * `requirements` is an enumerated list rather than a paragraph for one reason: it is
 * what makes "did the design address requirement 3?" an answerable question. Without
 * it the evaluator has nothing to check a design against and we are back to asking a
 * model for a vibe.
 *
 * Each problem is written to contain at least one deliberate ambiguity the learner is
 * expected to close in their assumptions (that is what criterion 1 reads), and at
 * least one axis of genuine variation the learner may or may not choose to abstract
 * (that is what criterion 4 reads).
 */

export const PARKING_LOT: Problem = {
  id: 'problem-parking-lot',
  slug: 'parking-lot',
  title: 'Parking Lot',
  statement: [
    'Design the classes for a multi-floor parking lot at a shopping centre.',
    'Vehicles arrive at an entry gate, are given a slot, and are issued a ticket.',
    'On exit the ticket is presented, a fee is calculated, payment is taken, and the',
    'slot is released. The operator wants to be able to change how fees are calculated',
    'without redeploying the system, and expects to add new vehicle categories over time.',
  ].join(' '),
  requirements: [
    'Park a vehicle: find a free slot that fits it, occupy the slot, and issue a ticket recording entry time.',
    'Unpark a vehicle: look up the ticket, compute the fee for the time parked, take payment, and free the slot.',
    'Support more than one floor, each with its own slots.',
    'Support at least three vehicle categories (motorcycle, car, bus) where a category constrains which slots fit.',
    'Support more than one fee scheme — for example hourly, flat day rate, and a free first 15 minutes.',
    'Report how many free slots remain, per floor and per vehicle category.',
    'Refuse entry when no slot fits the arriving vehicle, and say why.',
  ],
  constraints: [
    'Single site, single operator. No reservations, no season tickets, no membership.',
    'One vehicle occupies exactly one slot; no oversized vehicles spanning two slots.',
    'Payment is taken at exit only, and the payment processor itself is out of scope — model the boundary, not the integration.',
    'In-memory state is acceptable; you are not designing a database schema.',
    'Assume a single process. Do not design for concurrency, distribution, or hardware gates.',
  ],
  rubricId: MVP_RUBRIC_ID,
};

export const ELEVATOR: Problem = {
  id: 'problem-elevator',
  slug: 'elevator',
  title: 'Elevator System',
  statement: [
    'Design the classes for the control system of a bank of elevators in an office building.',
    'People press a call button on a floor, indicating a direction; people inside a car press',
    'a destination button. Something must decide which car serves which request, and each car',
    'must decide where it goes next. The building manager wants to change the dispatch policy',
    '(for example, an energy-saving policy at night) without rewriting the car logic.',
  ].join(' '),
  requirements: [
    'Accept a hall call: a floor plus a direction (up or down).',
    'Accept a car call: a destination floor requested from inside a specific car.',
    'Assign a hall call to exactly one car, and be able to change how that assignment is made.',
    'Move a car between floors, stopping in a sensible order for the requests it holds.',
    'Open and close doors at a stop, and model a door that is obstructed and must reopen.',
    'Expose the current state of each car: floor, direction, door state, and outstanding requests.',
    'Support taking a car out of service for maintenance without stopping the building.',
  ],
  constraints: [
    'Fixed number of floors and a fixed number of cars, known at construction.',
    'All cars serve all floors; there are no express or restricted zones.',
    'Model logical movement only — no physics, no acceleration curves, no motor control.',
    'No real-time scheduling guarantees are required. Judgement about ordering matters; timing precision does not.',
    'Single process, single building. Do not design for distribution or fault-tolerant hardware.',
  ],
  rubricId: MVP_RUBRIC_ID,
};

export const VENDING_MACHINE: Problem = {
  id: 'problem-vending-machine',
  slug: 'vending-machine',
  title: 'Vending Machine',
  statement: [
    'Design the classes for a coin-and-card operated vending machine.',
    'A customer selects a product, pays, and receives the product plus any change.',
    'The machine has a finite stock per slot and a finite float of coins, and both can run out',
    'mid-transaction. An operator restocks the machine and collects the takings. The vendor',
    'expects to add new payment methods later without reworking the purchase flow.',
  ].join(' '),
  requirements: [
    'Show available products with price and remaining stock.',
    'Accept payment by coin, one coin at a time, with a running total the customer can see.',
    'Accept payment by card as an alternative to coins.',
    'Dispense the product and the correct change, and refuse the sale when exact change cannot be made.',
    'Let the customer cancel before dispensing and get a full refund of coins inserted.',
    'Handle sold-out slots: reject the selection and refund without dispensing.',
    'Support an operator mode: restock a slot, top up the coin float, and collect takings.',
  ],
  constraints: [
    'One product per purchase. No multi-buy, no promotions, no loyalty scheme.',
    'A fixed, known set of coin denominations; no notes.',
    'The card network is out of scope — model the boundary and the two outcomes (authorised, declined).',
    'Single machine, single process. No telemetry, no remote management, no inventory service.',
    'Physical dispensing hardware is out of scope; assume a dispense command either succeeds or fails.',
  ],
  rubricId: MVP_RUBRIC_ID,
};

export const RATE_LIMITER: Problem = {
  id: 'problem-rate-limiter',
  slug: 'rate-limiter',
  title: 'API Rate Limiter',
  statement: [
    'Design the classes for a rate limiter that sits in front of an HTTP API.',
    'Each incoming request carries a client identity and a target endpoint, and the limiter',
    'answers one question: allow or reject. Different clients sit on different plans with',
    'different limits, and the team wants to be able to change the limiting algorithm',
    '(fixed window, sliding window, token bucket) per plan without touching the request path.',
  ].join(' '),
  requirements: [
    'Decide allow or reject for a request identified by client id and endpoint.',
    'Support at least two limiting algorithms and make which one is used a configuration choice, not a code change.',
    'Support per-plan limits: for example free at 10 requests/minute, pro at 1000 requests/minute.',
    'Support a per-endpoint limit that applies on top of the per-client limit.',
    'Return, on rejection, enough information for the caller to build a 429 response: the limit, the remaining count, and when it resets.',
    'Let limits be changed at runtime for a client without dropping their in-flight window.',
    'Expose counters for observability: allowed and rejected totals per client.',
  ],
  constraints: [
    'Single process, in-memory counters. Distributed coordination is explicitly out of scope — say so if your design would need it.',
    'Clients are identified by an opaque string; authentication is somebody else\'s problem.',
    'No persistence requirement; counters may be lost on restart.',
    'Do not design the HTTP server, middleware framework, or the response serialisation.',
    'Wall-clock time is supplied to the limiter, not read from inside it.',
  ],
  rubricId: MVP_RUBRIC_ID,
};

export const SEED_PROBLEMS: readonly Problem[] = [
  PARKING_LOT,
  ELEVATOR,
  VENDING_MACHINE,
  RATE_LIMITER,
];
