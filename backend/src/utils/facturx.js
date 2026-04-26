const PDFDocument = require('pdfkit');

// Génère le XML Factur-X (EN 16931 profile minimum)
function generateFacturXML(facture, cabinet, lignes) {
  const fmtDate = (d) => {
    const dt = new Date(d);
    return dt.toISOString().substring(0,10).replace(/-/g,'');
  };
  const fmtDateISO = (d) => new Date(d).toISOString().substring(0,10);
  const fmtAmt = (v) => parseFloat(v || 0).toFixed(2);

  const lignesXML = (lignes || []).map((l, i) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i+1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${escXML(l.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${fmtAmt(l.prixUnitaireHT)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="C62">${fmtAmt(l.quantite)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${fmtAmt(facture.tauxTVA || 20)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${fmtAmt(l.totalHT)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${escXML(facture.numero)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${fmtDate(facture.dateEmission)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>

    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${escXML(cabinet.nom || 'ParFi France')}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escXML(cabinet.siret || '')}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:LineOne>${escXML(cabinet.adresse || '')}</ram:LineOne>
          <ram:PostcodeCode>${escXML(cabinet.codePostal || '')}</ram:PostcodeCode>
          <ram:CityName>${escXML(cabinet.ville || '')}</ram:CityName>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${escXML(cabinet.numTVA || '')}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escXML(facture.client_nom || '')}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">${escXML(facture.client_siren || '')}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${escXML(facture.numero)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>30</ram:TypeCode>
        ${cabinet.iban ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${escXML(cabinet.iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmtAmt(facture.totalTVA)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${fmtAmt(facture.totalHT)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${fmtAmt(facture.tauxTVA || 20)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${fmtDate(facture.dateEcheance || new Date())}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmtAmt(facture.totalHT)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmtAmt(facture.totalHT)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${fmtAmt(facture.totalTVA)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmtAmt(facture.totalTTC)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${fmtAmt(facture.totalTTC)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>

    ${lignesXML}

  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

function escXML(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

// Génère un PDF simple avec les données de la facture (et XML Factur-X en metadata)
function generateFacturePDF(facture, cabinet, lignes, xmlStr) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
      Title: `Facture ${facture.numero}`,
      Author: cabinet.nom || 'ParFi France',
      Keywords: 'Factur-X',
    }});
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#0f1f4b';
    const cyan = '#00b4d8';
    const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(parseFloat(v || 0));

    // Header cabinet
    doc.fontSize(20).fillColor(navy).font('Helvetica-Bold').text(cabinet.nom || 'ParFi France', 50, 50);
    doc.fontSize(9).fillColor('#666').font('Helvetica')
       .text(cabinet.adresse || '', 50, 76)
       .text(`${cabinet.codePostal || ''} ${cabinet.ville || ''}`, 50, 88)
       .text(cabinet.email || '', 50, 100);

    // Numéro facture
    doc.fontSize(26).fillColor(cyan).font('Helvetica-Bold').text('FACTURE', 350, 50);
    doc.fontSize(12).fillColor(navy).text(facture.numero, 350, 82);
    doc.fontSize(9).fillColor('#666').font('Helvetica')
       .text(`Date : ${new Date(facture.dateEmission).toLocaleDateString('fr-FR')}`, 350, 100)
       .text(`Échéance : ${facture.dateEcheance ? new Date(facture.dateEcheance).toLocaleDateString('fr-FR') : '—'}`, 350, 112);

    // Divider
    doc.moveTo(50, 130).lineTo(545, 130).strokeColor(cyan).lineWidth(2).stroke();

    // Client
    doc.fontSize(9).fillColor('#666').font('Helvetica').text('FACTURER À :', 50, 145);
    doc.fontSize(11).fillColor(navy).font('Helvetica-Bold').text(facture.client_nom || '—', 50, 160);
    doc.fontSize(9).fillColor('#666').font('Helvetica').text(facture.client_siren ? `SIREN : ${facture.client_siren}` : '', 50, 175);

    // Table header
    const tableTop = 220;
    doc.rect(50, tableTop, 495, 22).fill(navy);
    doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold')
       .text('Description', 58, tableTop + 6)
       .text('Qté', 320, tableTop + 6)
       .text('P.U. HT', 370, tableTop + 6)
       .text('Total HT', 470, tableTop + 6, { width: 70, align: 'right' });

    // Lines
    let y = tableTop + 22;
    (lignes || []).forEach((l, i) => {
      if (i % 2 === 0) doc.rect(50, y, 495, 20).fill('#f5f7fb');
      doc.fillColor(navy).font('Helvetica').fontSize(9)
         .text(l.description || '', 58, y + 5, { width: 255 })
         .text(parseFloat(l.quantite || 1).toFixed(2), 320, y + 5)
         .text(fmt(l.prixUnitaireHT), 360, y + 5)
         .text(fmt(l.totalHT), 470, y + 5, { width: 70, align: 'right' });
      y += 20;
    });

    // Totals
    y += 16;
    const totalsX = 370;
    doc.fillColor('#666').font('Helvetica').fontSize(9)
       .text('Total HT', totalsX, y).text(fmt(facture.totalHT), 470, y, { width: 70, align: 'right' });
    y += 16;
    doc.text(`TVA ${parseFloat(facture.tauxTVA || 20).toFixed(0)}%`, totalsX, y)
       .text(fmt(facture.totalTVA), 470, y, { width: 70, align: 'right' });
    y += 4;
    doc.moveTo(totalsX, y).lineTo(545, y).strokeColor('#ccc').lineWidth(0.5).stroke();
    y += 8;
    doc.rect(totalsX - 5, y - 4, 180, 24).fill(navy);
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11)
       .text('TOTAL TTC', totalsX, y + 2).text(fmt(facture.totalTTC), 470, y + 2, { width: 70, align: 'right' });

    // Payment info
    y += 40;
    if (cabinet.iban) {
      doc.fillColor('#666').fontSize(8).font('Helvetica').text(`IBAN : ${cabinet.iban}`, 50, y);
      if (cabinet.bic) doc.text(`BIC : ${cabinet.bic}`, 50, y + 10);
    }

    // Footer Factur-X mention
    doc.fillColor('#aaa').fontSize(7).text(
      'Ce document est conforme à la norme Factur-X EN 16931 — Les données structurées XML sont intégrées.',
      50, 760, { align: 'center', width: 495 }
    );

    doc.end();
  });
}

module.exports = { generateFacturXML, generateFacturePDF };
