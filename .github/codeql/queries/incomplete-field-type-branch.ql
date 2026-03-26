/**
 * @name Incomplete PrimitiveFieldType branch
 * @description A function branches on FieldNode.type string values but omits one or
 *              more members of PrimitiveFieldType. When a new field type is added to
 *              ast.ts (e.g. "File" was added alongside existing types), any function
 *              that already handles 3+ types is assumed to be exhaustive — so missing
 *              entries become bugs that silently fall through or produce wrong output.
 *
 *              MAINTENANCE: keep primitiveFieldType() in sync with PrimitiveFieldType
 *              in packages/core/src/types/ast.ts.
 *
 * @kind problem
 * @problem.severity warning
 * @id vasp/incomplete-field-type-branch
 * @tags correctness
 *       maintainability
 */

import javascript

// ---------------------------------------------------------------------------
// Source of truth: all members of PrimitiveFieldType.
// Keep this predicate in sync with packages/core/src/types/ast.ts.
// ---------------------------------------------------------------------------
string primitiveFieldType() {
  result = "String" or
  result = "Int" or
  result = "Boolean" or
  result = "DateTime" or
  result = "Float" or
  result = "Text" or
  result = "Json" or
  result = "Enum" or
  result = "File"
}

// ---------------------------------------------------------------------------
// A strict-equality test (===) where one operand is a .type property access
// and the other is a PrimitiveFieldType string literal.
//
// Matches both orderings:
//   f.type === "Enum"
//   "Enum" === f.type
// ---------------------------------------------------------------------------
class FieldTypeCheck extends EqualityTest {
  string checkedValue;

  FieldTypeCheck() {
    (
      this.getLeftOperand().(PropAccess).getPropertyName() = "type" and
      checkedValue = this.getRightOperand().(StringLiteral).getStringValue()
      or
      this.getRightOperand().(PropAccess).getPropertyName() = "type" and
      checkedValue = this.getLeftOperand().(StringLiteral).getStringValue()
    ) and
    checkedValue = primitiveFieldType()
  }

  string getCheckedValue() { result = checkedValue }
}

// ---------------------------------------------------------------------------
// Heuristic: a function that already compares .type against 3 or more distinct
// PrimitiveFieldType values is almost certainly meant to be exhaustive.
// Single-purpose type guards (e.g. `if (f.type === "Enum")`) are excluded.
// ---------------------------------------------------------------------------
predicate isExhaustiveCandidate(Function f) {
  count(string v |
    exists(FieldTypeCheck c | c.getEnclosingFunction() = f and c.getCheckedValue() = v)
  ) >= 3
}

// ---------------------------------------------------------------------------
// Result: for every exhaustive-candidate function, flag each PrimitiveFieldType
// string that is never compared against inside it.
// ---------------------------------------------------------------------------
from Function f, string missingType
where
  isExhaustiveCandidate(f) and
  missingType = primitiveFieldType() and
  not exists(FieldTypeCheck c |
    c.getEnclosingFunction() = f and c.getCheckedValue() = missingType
  )
select f,
  "Branches on field .type and looks exhaustive (3+ types checked), " +
  "but does not handle '" + missingType + "'. " +
  "Update this function when adding new PrimitiveFieldType values to ast.ts."
