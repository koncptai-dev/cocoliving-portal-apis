const SIGNATURE_BOX_WIDTH = 130;
const SIGNATURE_BOX_HEIGHT = 40;

const ANCHOR_POINTS = {
  professional: {
    page_number: "14",
    resident: { top: 630, left: 400 },
    operator: { top: 630, left: 150 }
  },
  student: {
    page_number: "16",
    operator: { top: 410, left: 150 },
    guardian: { top: 350, left: 390 },
    resident: { top: 175, left: 320 }
  }
};

const toBox = ({ top, left }) => ({
  x1: left,
  y1: top - SIGNATURE_BOX_HEIGHT/2,
  x2: left + SIGNATURE_BOX_WIDTH,
  y2: top + SIGNATURE_BOX_HEIGHT/2
});

const SIGNATURE_BOXES = Object.fromEntries(
  Object.entries(ANCHOR_POINTS).map(([layout, { page_number, ...roles }]) => [
    layout,
    {
      page_number,
      ...Object.fromEntries(
        Object.entries(roles).map(([role, anchor]) => [role, toBox(anchor)])
      )
    }
  ])
);

/**
 * @param {"student"|"professional"} layout
 * @param {"resident"|"guardian"|"operator"} role
 * @returns {{ page_number: string, box: {x1:number,y1:number,x2:number,y2:number} }}
 */
function getSignatureBox(layout, role) {
  const layoutConfig = SIGNATURE_BOXES[layout];
  if (!layoutConfig || !layoutConfig[role]) {
    throw new Error(`No signature coordinates configured for layout="${layout}" role="${role}"`);
  }
  return { page_number: layoutConfig.page_number, box: layoutConfig[role] };
}

module.exports = { SIGNATURE_BOXES, getSignatureBox };