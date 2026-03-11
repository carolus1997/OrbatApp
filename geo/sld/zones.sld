<?xml version="1.0" encoding="UTF-8"?>
<!--
  SLD: Operational Zones (polygon layer)
  Zone types: exclusion, patrol, staging, buffer
-->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd">

  <NamedLayer>
    <Name>orbat:zones</Name>
    <UserStyle>
      <Title>Operational Zones</Title>

      <!-- Exclusion zone (red) -->
      <FeatureTypeStyle>
        <Rule>
          <Name>exclusion</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>zone_type</ogc:PropertyName>
              <ogc:Literal>exclusion</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill><CssParameter name="fill">#ff3b52</CssParameter><CssParameter name="fill-opacity">0.12</CssParameter></Fill>
            <Stroke>
              <CssParameter name="stroke">#ff3b52</CssParameter>
              <CssParameter name="stroke-width">2</CssParameter>
              <CssParameter name="stroke-opacity">0.7</CssParameter>
              <CssParameter name="stroke-dasharray">8 4</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font><CssParameter name="font-family">monospace</CssParameter><CssParameter name="font-size">10</CssParameter><CssParameter name="font-weight">bold</CssParameter></Font>
            <LabelPlacement><PointPlacement><AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>0.5</AnchorPointY></AnchorPoint></PointPlacement></LabelPlacement>
            <Fill><CssParameter name="fill">#ff3b52</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- Patrol zone (green) -->
      <FeatureTypeStyle>
        <Rule>
          <Name>patrol</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>zone_type</ogc:PropertyName>
              <ogc:Literal>patrol</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill><CssParameter name="fill">#00e87a</CssParameter><CssParameter name="fill-opacity">0.08</CssParameter></Fill>
            <Stroke>
              <CssParameter name="stroke">#00e87a</CssParameter>
              <CssParameter name="stroke-width">1.5</CssParameter>
              <CssParameter name="stroke-opacity">0.6</CssParameter>
              <CssParameter name="stroke-dasharray">6 3</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font><CssParameter name="font-family">monospace</CssParameter><CssParameter name="font-size">10</CssParameter></Font>
            <LabelPlacement><PointPlacement><AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>0.5</AnchorPointY></AnchorPoint></PointPlacement></LabelPlacement>
            <Fill><CssParameter name="fill">#00e87a</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- Staging / buffer zone (blue, default) -->
      <FeatureTypeStyle>
        <Rule>
          <Name>default-zone</Name>
          <Title>Staging / Buffer</Title>
          <PolygonSymbolizer>
            <Fill><CssParameter name="fill">#3cb8e8</CssParameter><CssParameter name="fill-opacity">0.08</CssParameter></Fill>
            <Stroke>
              <CssParameter name="stroke">#3cb8e8</CssParameter>
              <CssParameter name="stroke-width">1.5</CssParameter>
              <CssParameter name="stroke-opacity">0.5</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font><CssParameter name="font-family">monospace</CssParameter><CssParameter name="font-size">10</CssParameter></Font>
            <LabelPlacement><PointPlacement><AnchorPoint><AnchorPointX>0.5</AnchorPointX><AnchorPointY>0.5</AnchorPointY></AnchorPoint></PointPlacement></LabelPlacement>
            <Fill><CssParameter name="fill">#3cb8e8</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>
      </FeatureTypeStyle>

    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
