<?xml version="1.0" encoding="UTF-8"?>
<!--
  SLD: ORBAT Units (point layer)
  Applies scale-dependent rendering by echelon:
    company  → visible from any zoom
    platoon  → visible from zoom 9
    squad    → visible from zoom 11
    operator → visible from zoom 13
-->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd">

  <NamedLayer>
    <Name>orbat:units</Name>
    <UserStyle>
      <Title>ORBAT Units</Title>
      <Abstract>Tactical unit positions by echelon</Abstract>

      <!-- ── Company (always visible) ── -->
      <FeatureTypeStyle>
        <Rule>
          <Name>company</Name>
          <Title>Company</Title>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>echelon</ogc:PropertyName>
              <ogc:Literal>company</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>square</WellKnownName>
                <Fill>
                  <CssParameter name="fill">#00e87a</CssParameter>
                  <CssParameter name="fill-opacity">0.20</CssParameter>
                </Fill>
                <Stroke>
                  <CssParameter name="stroke">#00e87a</CssParameter>
                  <CssParameter name="stroke-width">2</CssParameter>
                </Stroke>
              </Mark>
              <Size>16</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label>
              <ogc:PropertyName>name</ogc:PropertyName>
            </Label>
            <Font>
              <CssParameter name="font-family">monospace</CssParameter>
              <CssParameter name="font-size">12</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>1.5</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>0</DisplacementX><DisplacementY>8</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">#e4f2ff</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- ── Platoon (zoom ≥ 9) ── -->
      <FeatureTypeStyle>
        <Rule>
          <Name>platoon</Name>
          <Title>Platoon</Title>
          <MinScaleDenominator>1</MinScaleDenominator>
          <MaxScaleDenominator>1000000</MaxScaleDenominator>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>echelon</ogc:PropertyName>
              <ogc:Literal>platoon</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>square</WellKnownName>
                <Fill>
                  <CssParameter name="fill">#3cb8e8</CssParameter>
                  <CssParameter name="fill-opacity">0.20</CssParameter>
                </Fill>
                <Stroke>
                  <CssParameter name="stroke">#3cb8e8</CssParameter>
                  <CssParameter name="stroke-width">1.5</CssParameter>
                </Stroke>
              </Mark>
              <Size>12</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">monospace</CssParameter>
              <CssParameter name="font-size">11</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>1.5</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>0</DisplacementX><DisplacementY>6</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">#9abdd8</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- ── Squad (zoom ≥ 11) ── -->
      <FeatureTypeStyle>
        <Rule>
          <Name>squad</Name>
          <Title>Squad</Title>
          <MaxScaleDenominator>200000</MaxScaleDenominator>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>echelon</ogc:PropertyName>
              <ogc:Literal>squad</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill>
                  <CssParameter name="fill">#ffaa33</CssParameter>
                  <CssParameter name="fill-opacity">0.20</CssParameter>
                </Fill>
                <Stroke>
                  <CssParameter name="stroke">#ffaa33</CssParameter>
                  <CssParameter name="stroke-width">1.5</CssParameter>
                </Stroke>
              </Mark>
              <Size>10</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">monospace</CssParameter>
              <CssParameter name="font-size">10</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>1.5</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>0</DisplacementX><DisplacementY>5</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">#9abdd8</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- ── Operator (zoom ≥ 13) ── -->
      <FeatureTypeStyle>
        <Rule>
          <Name>operator</Name>
          <Title>Operator</Title>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>echelon</ogc:PropertyName>
              <ogc:Literal>operator</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill>
                  <CssParameter name="fill">#8866ff</CssParameter>
                  <CssParameter name="fill-opacity">0.25</CssParameter>
                </Fill>
                <Stroke>
                  <CssParameter name="stroke">#8866ff</CssParameter>
                  <CssParameter name="stroke-width">1</CssParameter>
                </Stroke>
              </Mark>
              <Size>8</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">monospace</CssParameter>
              <CssParameter name="font-size">9</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>1.5</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>0</DisplacementX><DisplacementY>4</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">#5a88a8</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
