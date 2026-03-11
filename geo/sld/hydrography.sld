<?xml version="1.0" encoding="UTF-8"?>
<!--
  SLD: Hydrography (line + polygon layer)
  Features: rivers, canals, lakes/reservoirs
-->
<StyledLayerDescriptor version="1.0.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.opengis.net/sld StyledLayerDescriptor.xsd">

  <NamedLayer>
    <Name>orbat:hydrography</Name>
    <UserStyle>
      <Title>Hydrography</Title>

      <!-- River / stream (line) -->
      <FeatureTypeStyle>
        <Rule>
          <Name>river</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>water_type</ogc:PropertyName>
              <ogc:Literal>river</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#00d4e8</CssParameter>
              <CssParameter name="stroke-width">2</CssParameter>
              <CssParameter name="stroke-opacity">0.7</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- Canal (line, thinner) -->
      <FeatureTypeStyle>
        <Rule>
          <Name>canal</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>water_type</ogc:PropertyName>
              <ogc:Literal>canal</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">#00d4e8</CssParameter>
              <CssParameter name="stroke-width">1.2</CssParameter>
              <CssParameter name="stroke-opacity">0.55</CssParameter>
              <CssParameter name="stroke-dasharray">4 3</CssParameter>
            </Stroke>
          </LineSymbolizer>
        </Rule>
      </FeatureTypeStyle>

      <!-- Lake / reservoir (polygon) -->
      <FeatureTypeStyle>
        <Rule>
          <Name>lake</Name>
          <Title>Lake / Reservoir</Title>
          <PolygonSymbolizer>
            <Fill><CssParameter name="fill">#00d4e8</CssParameter><CssParameter name="fill-opacity">0.18</CssParameter></Fill>
            <Stroke>
              <CssParameter name="stroke">#00d4e8</CssParameter>
              <CssParameter name="stroke-width">1</CssParameter>
              <CssParameter name="stroke-opacity">0.5</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>
      </FeatureTypeStyle>

    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
