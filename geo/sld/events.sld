<?xml version="1.0" encoding="UTF-8"?>
<!--
  SLD: Tactical Events (point layer)
  Severity: critical → red, warning → amber, info → blue
-->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd">

  <NamedLayer>
    <Name>orbat:events</Name>
    <UserStyle>
      <Title>Tactical Events</Title>

      <!-- Critical -->
      <FeatureTypeStyle>
        <Rule>
          <Name>critical</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>severity</ogc:PropertyName>
              <ogc:Literal>critical</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>triangle</WellKnownName>
                <Fill><CssParameter name="fill">#ff3b52</CssParameter><CssParameter name="fill-opacity">0.85</CssParameter></Fill>
                <Stroke><CssParameter name="stroke">#ffffff</CssParameter><CssParameter name="stroke-width">1</CssParameter></Stroke>
              </Mark>
              <Size>14</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>label</ogc:PropertyName></Label>
            <Font><CssParameter name="font-family">monospace</CssParameter><CssParameter name="font-size">9</CssParameter></Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>2</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>0</DisplacementX><DisplacementY>6</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">#ff3b52</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- Warning -->
      <FeatureTypeStyle>
        <Rule>
          <Name>warning</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>severity</ogc:PropertyName>
              <ogc:Literal>warning</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>triangle</WellKnownName>
                <Fill><CssParameter name="fill">#ffaa33</CssParameter><CssParameter name="fill-opacity">0.85</CssParameter></Fill>
                <Stroke><CssParameter name="stroke">#ffffff</CssParameter><CssParameter name="stroke-width">1</CssParameter></Stroke>
              </Mark>
              <Size>12</Size>
            </Graphic>
          </PointSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>label</ogc:PropertyName></Label>
            <Font><CssParameter name="font-family">monospace</CssParameter><CssParameter name="font-size">9</CssParameter></Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>2</AnchorPointY></AnchorPoint>
                <Displacement><DisplacementX>0</DisplacementX><DisplacementY>5</DisplacementY></Displacement>
              </PointPlacement>
            </LabelPlacement>
            <Fill><CssParameter name="fill">#ffaa33</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- Info / default -->
      <FeatureTypeStyle>
        <Rule>
          <Name>info</Name>
          <Title>Info / Default</Title>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#3cb8e8</CssParameter><CssParameter name="fill-opacity">0.80</CssParameter></Fill>
                <Stroke><CssParameter name="stroke">#ffffff</CssParameter><CssParameter name="stroke-width">1</CssParameter></Stroke>
              </Mark>
              <Size>10</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>

    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
