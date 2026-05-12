import imgGradient1 from "figma:asset/168b8d39a96e52caef47c7f666d1ee1c7f93f54c.png";
import { imgGradient } from "./svg-b5sh1";

export default function MaskGroup() {
  return (
    <div className="relative size-full" data-name="Mask group">
      <div className="absolute left-[-100px] mask-alpha mask-intersect mask-no-clip mask-no-repeat mask-position-[100px] mask-size-[200px_200px] size-[346px] top-[-100px]" data-name="Gradient" style={{ maskImage: `url('${imgGradient}')` }}>
        <img alt="" className="absolute inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgGradient1} />
      </div>
      <div className="absolute inset-0 pointer-events-none shadow-[6px_6px_4px_0px_inset_rgba(255,255,255,0.25),-6px_-6px_8px_0px_inset_rgba(0,0,0,0.2)]" />
    </div>
  );
}