export const VERT = `#version 300 es
out vec2 v_uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));v_uv=vec2(p.x,1.-p.y);gl_Position=vec4(p*2.-1.,0.,1.);}`;
export const PRELUDE = `#version 300 es
precision highp float;
in vec2 v_uv;out vec4 outColor;uniform vec2 u_res;
vec4 at(sampler2D t,vec2 p){return texture(t,vec2(p.x,1.-p.y));}
float s2l(float c){return c<=.04045?c/12.92:pow((c+.055)/1.055,2.4);}
float l2s(float c){return c<=.0031308?12.92*c:1.055*pow(c,1./2.4)-.055;}
vec3 s2l(vec3 c){return vec3(s2l(c.r),s2l(c.g),s2l(c.b));}
vec3 l2s(vec3 c){return vec3(l2s(c.r),l2s(c.g),l2s(c.b));}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec4 unpremul(vec4 c){return c.a>0.?vec4(c.rgb/c.a,c.a):vec4(0);}
vec4 premul(vec4 c){return vec4(c.rgb*c.a,c.a);}
vec3 cubeRoot(vec3 x){return sign(x)*pow(abs(x),vec3(1./3.));}
vec3 lab(vec3 c){
 vec3 v=cubeRoot(vec3(dot(c,vec3(.4122214708,.5363325363,.0514459929)),dot(c,vec3(.2119034982,.6806995451,.1073969566)),dot(c,vec3(.0883024619,.2817188376,.6299787005))));
 return vec3(dot(v,vec3(.2104542553,.793617785,-.0040720468)),dot(v,vec3(1.9779984951,-2.428592205,.4505937099)),dot(v,vec3(.0259040371,.7827717662,-.808675766)));
}
vec3 rgb(vec3 c){
 vec3 v=vec3(c.x+.3963377774*c.y+.2158037573*c.z,c.x-.1055613458*c.y-.0638541728*c.z,c.x-.0894841775*c.y-1.291485548*c.z);v=v*v*v;
 return vec3(dot(v,vec3(4.0767416621,-3.3077115913,.2309699292)),dot(v,vec3(-1.2684380046,2.6097574011,-.3413193965)),dot(v,vec3(-.0041960863,-.7034186147,1.707614701)));
}
float hash(vec2 p){uvec2 q=uvec2(ivec2(floor(p)));uint n=q.x*1597334677u+q.y*3812015801u;n=(n^(n>>16u))*2246822519u;n=(n^(n>>13u))*3266489917u;n^=n>>16u;return float(n)/4294967295.;}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+17.;a*=.5;}return v;}
float wlum(vec3 c){return dot(c,vec3(.3,.59,.11));}
float sat(vec3 c){return max(max(c.r,c.g),c.b)-min(min(c.r,c.g),c.b);}
vec3 setlum(vec3 c,float l){c+=l-wlum(c);float n=min(min(c.r,c.g),c.b),x=max(max(c.r,c.g),c.b);if(n<0.)c=l+(c-l)*l/(l-n);if(x>1.)c=l+(c-l)*(1.-l)/(x-l);return c;}
vec3 setsat(vec3 c,float s){float n=min(min(c.r,c.g),c.b),d=sat(c);return d>0.?(c-n)*s/d:vec3(0);}
float hard(float b,float s){return s<=.5?b*2.*s:b+(2.*s-1.)-b*(2.*s-1.);}
float sep(int m,float b,float s){
 if(m==1)return b*s;if(m==2)return b+s-b*s;if(m==3)return hard(s,b);if(m==4)return min(b,s);if(m==5)return max(b,s);
 if(m==6)return b==0.?0.:s>=1.?1.:min(1.,b/(1.-s));if(m==7)return b>=1.?1.:s==0.?0.:1.-min(1.,(1.-b)/s);
 if(m==8)return hard(b,s);if(m==9){float d=b<=.25?((16.*b-12.)*b+4.)*b:sqrt(max(0.,b));return s<=.5?b-(1.-2.*s)*b*(1.-b):b+(2.*s-1.)*(d-b);}
 if(m==10)return abs(b-s);if(m==11)return b+s;return s;
}
vec3 blend(int m,vec3 b,vec3 s){
 if(m==12)return setlum(setsat(s,sat(b)),wlum(b));if(m==13)return setlum(setsat(b,sat(s)),wlum(b));
 if(m==14)return setlum(s,wlum(b));if(m==15)return setlum(b,wlum(s));
 return vec3(sep(m,b.r,s.r),sep(m,b.g,s.g),sep(m,b.b,s.b));
}
`;
export const SHADERS = {
 transform: `uniform sampler2D u_img;uniform vec2 u_comp,u_translate;uniform float u_scale,u_rotate;uniform bool u_flip;
 void main(){vec2 p=(v_uv-.5)*u_comp-u_translate;float c=cos(u_rotate),s=sin(u_rotate);p=mat2(c,-s,s,c)*p;if(u_flip)p.x=-p.x;vec2 q=p/(u_comp*u_scale)+.5;outColor=any(lessThan(q,vec2(0)))||any(greaterThan(q,vec2(1)))?vec4(0):at(u_img,q);}`,
 copy: `uniform sampler2D u_img;void main(){outColor=at(u_img,v_uv);}`,
 input: `uniform sampler2D u_img;uniform int u_space;uniform vec2 u_size,u_comp,u_translate;uniform float u_scale,u_rotate;uniform bool u_flip;
 void main(){vec2 p=(v_uv-.5)*u_comp-u_translate;float c=cos(u_rotate),s=sin(u_rotate);p=mat2(c,-s,s,c)*p;if(u_flip)p.x=-p.x;vec2 q=p/(u_size*u_scale)+.5;
 if(any(lessThan(q,vec2(0)))||any(greaterThan(q,vec2(1)))){outColor=vec4(0);return;}
 vec4 v=texture(u_img,q);if(u_space==1)v.rgb=l2s(v.rgb);outColor=premul(v);}`,
 solid: `uniform vec3 u_color;uniform float u_alpha;uniform int u_space;void main(){outColor=vec4((u_space==1?l2s(u_color):u_color)*u_alpha,u_alpha);}`,
 gradient: `uniform vec3 u_color;uniform int u_space,u_kind;uniform float u_angle,u_start,u_end,u_feather,u_alphaStart,u_alphaEnd;
 void main(){vec2 dir=vec2(cos(u_angle),sin(u_angle));float x=u_kind==1?length((v_uv-.5)*2.):dot(v_uv-.5,dir)+.5;float t=clamp((x-u_start)/max(.00001,u_end-u_start),0.,1.);t=mix(t,t*t*(3.-2.*t),u_feather);float a=mix(u_alphaStart,u_alphaEnd,t);outColor=vec4((u_space==1?l2s(u_color):u_color)*a,a);}`,
 mask: `uniform sampler2D u_img;uniform int u_kind;uniform bool u_invert;uniform vec4 u_rect;uniform float u_angle;
 void main(){vec4 c=at(u_img,v_uv);float a=1.;if(u_kind==1)a=c.a;if(u_kind==2)a=lum(c.rgb);if(u_kind==3)a=clamp(dot(v_uv-.5,vec2(cos(u_angle),sin(u_angle)))+.5,0.,1.);if(u_kind==4)a=step(u_rect.x,v_uv.x)*step(u_rect.y,v_uv.y)*step(v_uv.x,u_rect.z)*step(v_uv.y,u_rect.w);if(u_invert)a=1.-a;outColor=vec4(a);}`,
 multiplyMask: `uniform sampler2D u_img,u_mask;uniform float u_opacity;void main(){outColor=at(u_img,v_uv)*at(u_mask,v_uv).a*u_opacity;}`,
 blend: `uniform sampler2D u_base,u_layer,u_mask;uniform float u_opacity;uniform int u_mode;uniform bool u_adjust,u_atop;
 void main(){vec4 b=at(u_base,v_uv),s=at(u_layer,v_uv);float k=u_opacity*at(u_mask,v_uv).a;
 if(u_adjust){if(u_mode!=0)s=vec4(blend(u_mode,unpremul(b).rgb,unpremul(s).rgb)*s.a,s.a);outColor=mix(b,s,k);return;}s*=k;
 vec3 cb=unpremul(b).rgb,cs=unpremul(s).rgb,bl=blend(u_mode,cb,cs);
 if(u_atop){outColor=vec4(mix(cb,bl,s.a)*b.a,b.a);return;}
 outColor=vec4((1.-b.a)*s.rgb+(1.-s.a)*b.rgb+s.a*b.a*bl,s.a+b.a*(1.-s.a));}`,
 blur: `uniform sampler2D u_img;uniform vec2 u_step;uniform float u_sigma;
 void main(){vec4 c=vec4(0);float total=0.;for(int j=-12;j<=12;j++){float w=exp(-float(j*j)/(2.*max(.01,u_sigma*u_sigma)));vec2 q=v_uv+float(j)*u_step;c+=at(u_img,q)*w;total+=w;}outColor=c/total;}`,
 bright: `uniform sampler2D u_img;uniform float u_threshold,u_knee;
 void main(){vec4 c=at(u_img,v_uv);float l=lum(c.rgb),k=max(.0001,u_knee*u_threshold);float soft=clamp(l-u_threshold+k,0.,2.*k);soft=soft*soft/(4.*k);float w=max(l-u_threshold,soft)/max(l,.00001);outColor=vec4(c.rgb*max(0.,w),c.a);}`,
 combine: `uniform sampler2D u_img,u_other,u_bg;uniform int u_kind;uniform float u_intensity;uniform vec3 u_color;uniform bool u_screen;
 void main(){vec4 c=at(u_img,v_uv),b=at(u_other,v_uv);vec3 col=unpremul(c).rgb;
 if(u_kind==0)outColor=vec4(c.rgb+b.rgb*u_intensity*u_color,c.a);
 if(u_kind==1)outColor=vec4(mix(col,blend(2,col,unpremul(b).rgb),u_intensity)*c.a,c.a);
 if(u_kind==2){float edge=c.a*max(0.,1.-b.a);vec3 light=unpremul(at(u_bg,v_uv)).rgb;if(u_screen)outColor=vec4(mix(col,blend(2,col,light),edge*u_intensity)*c.a,c.a);else outColor=vec4(c.rgb+light*edge*u_intensity,c.a);}
 if(u_kind==3){vec3 extended=c.a>.001?col:unpremul(b).rgb;outColor=vec4(extended*b.a,b.a);}
 }`,
 grade: `uniform sampler2D u_img;uniform int u_space;uniform float u_exposure,u_temp,u_tint,u_contrast,u_saturation,u_hue;uniform vec3 u_slope,u_offset,u_power;
 void main(){vec4 c=unpremul(at(u_img,v_uv));vec3 v=u_space==1?s2l(c.rgb):c.rgb;v*=exp2(u_exposure)*vec3(1.+.25*u_temp,1.+.15*u_tint,1.-.25*u_temp);
 v=.18*pow(max(v/.18,vec3(0)),vec3(u_contrast));v=pow(max(v*u_slope+u_offset,vec3(0)),u_power);vec3 o=lab(v);float cs=cos(u_hue),sn=sin(u_hue);o.yz=mat2(cs,sn,-sn,cs)*o.yz*u_saturation;v=rgb(o);if(u_space==1)v=l2s(v);outColor=vec4(v*c.a,c.a);}`,
 stats: `uniform sampler2D u_img;uniform int u_space;uniform float u_strength;uniform vec3 u_sourceMean,u_sourceStd,u_targetMean,u_targetStd;
 void main(){vec4 c=unpremul(at(u_img,v_uv));vec3 v=lab(u_space==1?s2l(c.rgb):c.rgb);vec3 mapped=(v-u_sourceMean)*clamp(u_targetStd/max(u_sourceStd,vec3(.000001)),vec3(.5),vec3(2))+u_targetMean;v=rgb(mix(v,mapped,u_strength));if(u_space==1)v=l2s(v);outColor=vec4(v*c.a,c.a);}`,
 range: `uniform sampler2D u_img;uniform int u_space;uniform float u_strength,u_sourceLow,u_sourceHigh,u_targetLow,u_targetHigh;
 void main(){vec4 c=unpremul(at(u_img,v_uv));vec3 v=lab(u_space==1?s2l(c.rgb):c.rgb);float l=(v.x-u_sourceLow)/max(.00001,u_sourceHigh-u_sourceLow)*(u_targetHigh-u_targetLow)+u_targetLow;v.x=mix(v.x,l,u_strength);v=rgb(v);if(u_space==1)v=l2s(v);outColor=vec4(v*c.a,c.a);}`,
 fog: `uniform sampler2D u_img;uniform vec3 u_color;uniform float u_density;uniform int u_space;
 void main(){vec4 c=at(u_img,v_uv);outColor=vec4(mix(c.rgb,(u_space==1?l2s(u_color):u_color)*c.a,u_density),c.a);}`,
 grain: `uniform sampler2D u_img;uniform float u_intensity,u_size,u_seed;uniform bool u_mono;uniform vec2 u_comp;
 void main(){vec4 c=unpremul(at(u_img,v_uv));vec2 p=floor(v_uv*u_comp/u_size)+u_seed;vec3 n=vec3(hash(p),hash(p+vec2(91,17)),hash(p+vec2(38,197)))-.5;if(u_mono)n=vec3(n.r);outColor=vec4((c.rgb+u_intensity*n*(.5+lum(c.rgb)))*c.a,c.a);}`,
 vignette: `uniform sampler2D u_img;uniform float u_intensity,u_radius,u_soft,u_roundness;
 void main(){vec2 p=(v_uv-.5)*2.;p.x*=mix(u_res.x/u_res.y,1.,u_roundness);float k=smoothstep(u_radius-u_soft,u_radius+u_soft,length(p));vec4 c=at(u_img,v_uv);outColor=vec4(c.rgb*(1.-clamp(u_intensity*k,0.,1.)),c.a);}`,
 output: `uniform sampler2D u_img,u_before;uniform int u_space,u_tonemap;uniform float u_exposure,u_split,u_scale;uniform bool u_transparent,u_checker,u_ab,u_raw;
 void main(){vec4 c=at(u_img,v_uv);if(u_ab&&v_uv.x<u_split)c=at(u_before,v_uv);if(u_raw){outColor=vec4(c.rgb*u_scale,c.a);return;}
 vec3 v;if(u_transparent)v=unpremul(c).rgb;else{float check=mod(floor(v_uv.x*u_res.x/16.)+floor(v_uv.y*u_res.y/16.),2.)==0.?.11:.16;v=c.rgb+(1.-c.a)*vec3(u_checker?check:0.);}
 if(u_space==1)v=s2l(v);v*=exp2(u_exposure);if(u_tonemap==1)v=v/(1.+v);if(u_tonemap==2)v=clamp((v*(2.51*v+.03))/(v*(2.43*v+.59)+.14),0.,1.);
 outColor=vec4(l2s(clamp(v,0.,1.)),u_transparent?c.a:1.);}`
};
