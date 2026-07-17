const fs = require("fs");
const {
  PDFDocument,
  StandardFonts,
  rgb
} = require("pdf-lib");

const { getSignatureBox } = require("./esignSignatureCoordinates");

const GRID_SMALL = 10;
const GRID_MEDIUM = 50;
const GRID_LARGE = 100;

function drawText(page, font, text, x, y, size = 6, color = rgb(0,0,0)) {
  page.drawText(String(text), {
    x,
    y,
    size,
    font,
    color
  });
}

function drawGrid(page, font) {
  const { width, height } = page.getSize();

  for (let x = 0; x <= width; x += GRID_SMALL) {
    let color = rgb(.90,.90,.90);
    let thickness = 0.2;

    if (x % GRID_MEDIUM === 0) {
      color = rgb(.70,.70,.70);
      thickness = 0.4;
    }

    if (x % GRID_LARGE === 0) {
      color = rgb(.35,.35,.35);
      thickness = 0.8;
    }

    page.drawLine({
      start:{x,y:0},
      end:{x,y:height},
      thickness,
      color
    });

    if (x % GRID_MEDIUM === 0) {
      drawText(page,font,x,x+1,2,6);
      drawText(page,font,x,x+1,height-8,6);
    }
  }

  for (let y = 0; y <= height; y += GRID_SMALL) {

    let color = rgb(.90,.90,.90);
    let thickness = 0.2;

    if (y % GRID_MEDIUM === 0) {
      color = rgb(.70,.70,.70);
      thickness = 0.4;
    }

    if (y % GRID_LARGE === 0) {
      color = rgb(.35,.35,.35);
      thickness = 0.8;
    }

    page.drawLine({
      start:{x:0,y},
      end:{x:width,y},
      thickness,
      color
    });

    if (y % GRID_MEDIUM === 0) {
      drawText(page,font,y,2,y+2,6);
      drawText(page,font,y,width-22,y+2,6);
    }
  }

  page.drawRectangle({
    x:0,
    y:0,
    width,
    height,
    borderColor:rgb(1,0,0),
    borderWidth:1
  });

  drawText(page,font,"Origin (0,0)",5,5,8,rgb(1,0,0));

  drawText(
    page,
    font,
    `Page Size : ${Math.round(width)} x ${Math.round(height)}`,
    170,
    height-12,
    8,
    rgb(1,0,0)
  );
}

function drawBox(page,font,title,pageNumber,box,color){

  page.drawRectangle({
      x:box.x1,
      y:box.y1,
      width:box.x2-box.x1,
      height:box.y2-box.y1,
      borderWidth:1.5,
      borderColor:color
  });

  const text =
`${title}
Page ${pageNumber}

x1=${Math.round(box.x1)}
y1=${Math.round(box.y1)}

x2=${Math.round(box.x2)}
y2=${Math.round(box.y2)}

w=${Math.round(box.x2-box.x1)}
h=${Math.round(box.y2-box.y1)}
`;

  const tx=Math.min(box.x2+6,page.getSize().width-130);
  const ty=Math.min(box.y2+5,page.getSize().height-80);

  page.drawText(text,{
      x:tx,
      y:ty,
      size:7,
      font,
      color
  });
}

async function overlayCalibrationGrid(
    inputPdfPath,
    outputPdfPath,
    layout
){

    const pdf=await PDFDocument.load(
        fs.readFileSync(inputPdfPath)
    );

    const font=await pdf.embedFont(StandardFonts.Helvetica);

    pdf.getPages().forEach((page,index)=>{

        drawGrid(page,font);

        drawText(
            page,
            font,
            `PDF PAGE ${index+1}`,
            250,
            page.getSize().height-25,
            10,
            rgb(1,0,0)
        );

    });

    const resident=getSignatureBox(layout,"resident");

    const residentPage=pdf.getPage(
        Number(resident.page_number)-1
    );

    drawBox(
        residentPage,
        font,
        "RESIDENT",
        resident.page_number,
        resident.box,
        rgb(1,0,0)
    );

    if(layout==="student"){

        const guardian=getSignatureBox(layout,"guardian");

        drawBox(
            pdf.getPage(Number(guardian.page_number)-1),
            font,
            "GUARDIAN",
            guardian.page_number,
            guardian.box,
            rgb(0,0,1)
        );

    }

    const operator=getSignatureBox(layout,"operator");

    drawBox(
        pdf.getPage(Number(operator.page_number)-1),
        font,
        "OPERATOR",
        operator.page_number,
        operator.box,
        rgb(0,.6,0)
    );

    fs.writeFileSync(
        outputPdfPath,
        await pdf.save()
    );

}

module.exports={
    overlayCalibrationGrid
};