/**
 * @name Incomplete VaspNode type switch
 * @description A switch statement discriminates on a .type property, has a default
 *              case that throws (signalling exhaustive intent), covers at least one
 *              VaspNode type string — but is missing one or more members of the
 *              VaspNode union.
 *
 *              This is the canonical guard for the "new node type added, switch not
 *              updated" bug class. The default-throw pattern is the marker:
 *
 *                switch (node.type) {
 *                  case "App":   ...; break;
 *                  case "Email": ...; break;   // <-- must add case for every new type
 *                  default:
 *                    throw new Error(`Unhandled node type: ${node.type}`);
 *                }
 *
 *              MAINTENANCE: keep vaspNodeType() in sync with the VaspNode union
 *              in packages/core/src/types/ast.ts.
 *
 * @kind problem
 * @problem.severity error
 * @id vasp/incomplete-vaspnode-switch
 * @tags correctness
 *       maintainability
 */

import javascript

// ---------------------------------------------------------------------------
// Source of truth: all .type discriminant values from the VaspNode union.
// Keep this predicate in sync with packages/core/src/types/ast.ts.
// ---------------------------------------------------------------------------
string vaspNodeType() {
  result = "App" or
  result = "Auth" or
  result = "Entity" or
  result = "Route" or
  result = "Page" or
  result = "Query" or
  result = "Action" or
  result = "Api" or
  result = "Middleware" or
  result = "Crud" or
  result = "Realtime" or
  result = "Job" or
  result = "Seed" or
  result = "Admin" or
  result = "Storage" or
  result = "Email"
}

// ---------------------------------------------------------------------------
// A switch statement that:
//   1. Discriminates on a .type property access
//   2. Has at least one case whose label is a VaspNode type string
//   3. Has a default case that contains a ThrowStmt — the explicit signal that
//      the developer intended this switch to be exhaustive
//
// Condition 3 is what separates "this switch is supposed to cover everything"
// from "this switch intentionally handles a subset of types."
// ---------------------------------------------------------------------------
class ExhaustiveVaspSwitch extends SwitchStmt {
  ExhaustiveVaspSwitch() {
    // 1. Discriminant is a .type property access
    this.getExpr().(PropAccess).getPropertyName() = "type" and

    // 2. At least one case label matches a known VaspNode type
    exists(Case c |
      c = this.getACase() and
      c.getExpr().(StringLiteral).getStringValue() = vaspNodeType()
    ) and

    // 3. Default case exists and contains a throw (exhaustive intent marker)
    exists(DefaultCase dc, ThrowStmt t |
      dc = this.getDefaultCase() and
      t.getParent+() = dc
    )
  }

  /** All VaspNode type strings covered by an explicit case in this switch. */
  string getCoveredType() {
    exists(Case c |
      c = this.getACase() and
      result = c.getExpr().(StringLiteral).getStringValue() and
      result = vaspNodeType()
    )
  }
}

// ---------------------------------------------------------------------------
// Result: for every switch that opts in to exhaustive coverage (default throw),
// flag each VaspNode type string that has no corresponding case.
// ---------------------------------------------------------------------------
from ExhaustiveVaspSwitch s, string missingType
where
  missingType = vaspNodeType() and
  not s.getCoveredType() = missingType
select s,
  "Switch on .type has a default throw (exhaustive intent) but is missing " +
  "case '" + missingType + "'. Add a case or update vaspNodeType() in this query " +
  "if the new node type should not be handled here."
