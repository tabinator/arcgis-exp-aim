# Create Package Workflow

This document defines the agreed target workflow for the AiM Manager V2
**Creating New Package** mode.

## Selection and staging

1. The user enters **Creating New Package** mode.
2. The widget clears the previous draft and resets its validation options.
3. The user selects deficiencies on the map. Eligible deficiencies are added
   automatically to the Package Cart.
4. The first staged deficiency establishes:
   - the target feature layer;
   - `PropertyName`;
   - `WorkCode`; and
   - the generated Package ID/Name:
     `PROPERTYNAME-WorkCode-MMDDYY-HHmm`.
5. Each additional deficiency must:
   - belong to the same target layer;
   - have no existing package value;
   - have the same `PropertyName`;
   - have the same `WorkCode`; and
   - not already exist in the cart.
6. The user may manually edit the generated Package ID/Name.

## Validation and confirmation

7. The user selects **Create Package**.
8. The widget confirms that:
   - the Package ID/Name is present;
   - the cart contains at least one deficiency;
   - all staged deficiencies belong to one target layer; and
   - none of the staged deficiencies already has a package value.
9. The widget opens a confirmation modal showing the Package ID/Name, the
   number of staged deficiencies, and a summary of the operation.
10. No edits occur until the user selects **Confirm Create**.

## Creation sequence

11. The widget updates the configured package field, currently `PCKGID`, on
    every staged ArcGIS deficiency.
12. If any ArcGIS edit fails:
    - stop the workflow;
    - do not create a Box folder;
    - preserve the cart and creation mode; and
    - display the error.
13. If all ArcGIS edits succeed, create a Box project folder using the Package
    ID/Name.
14. If Box folder creation fails:
    - roll back the ArcGIS package-field edits to their original values;
    - preserve the cart and creation mode; and
    - display the Box error.
15. If Box folder creation succeeds:
    - clear the cart and map selection;
    - exit creation mode;
    - refresh the package list;
    - make the new package immediately available in the list; and
    - display a success message containing the Package ID and deficiency count.

## Integration boundaries

- The AiM work-order submission API is **not** part of package creation. It
  belongs to the **Create Work Order** action in Modifying Existing Package
  mode.
- Box folder creation and the compensating ArcGIS rollback remain pending until
  the Box API contract is available.
- The Create Package implementation is not complete until the Box sequence and
  compensating ArcGIS rollback above are implemented.
