/**
 * The text shown inside the "terms and conditions" modal on the register page.
 *
 * This is only the CONTENT - the modal box around it lives in
 * @/Components/Common/Modal, and the register page decides when to open it.
 * Keeping them apart means you can drop this same text into a settings page
 * or a signup email later without touching any modal code.
 *
 * WRITE YOUR REAL TERMS BELOW.
 * The sections here are placeholders showing the pattern - replace the
 * headings and paragraphs with your own wording. Add or remove <section>
 * blocks freely; the modal scrolls on its own however long this gets.
 */
import React from "react";

export function TermsAndConditions() {

  return (
    <React.Fragment>
      <div className=" bg-gray-50 py-6 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">

          {/* Terms Card */}
          <div
            className="
            mb-6
            overflow-y-auto
            rounded-lg
            bg-white
            p-6
            shadow-[0_4px_20px_rgba(0,0,0,0.08)]
            text-sm
            leading-6
            text-gray-700
          "
          >
            <p className="mb-4">
              The term of this Agreement shall commence when the when the Company
              provides access to the services and/or products. This Agreement
              shall be valid from
            </p>

            <p className="mb-4">
              (1) one year therefrom and shall automatically renew until the
              Agreement is expressively terminated in writing by the User and/or
              Company.
            </p>

            <p className="mb-4">
              (2) Company’s Obligations. Company shall provide User with access to
              the Software and user products. Company will be available during
              normal business hours for support on User inquiries. Users will
              designate a primary contact to send and receive inquiries.
            </p>

            <p className="mb-4">
              (3) Registration. Company shall send User a registration code within
              seven 7 business days after reception of valid order form and
              advance payment. This code enables User access to the cloud-based
              services.
            </p>

            <p className="mb-4">
              (4) Basic Information Provided By User For A Paid Subscription. In
              order to provide services to User, Company may collect from User
              and store in its cloud or other storage system basic information
              including, without limitation, User’s name, address, telephone
              number(s), email address(es), and information regarding the User or
              other products, equipment and/or systems present in User premises
              (collectively, “Basic Information”). Company shall have the right
              to use Basic Information for any purpose related to Company’s
              internal business activities, and to share Basic Information with
              Company’s authorized third party dealers who may use such
              information for any internal purpose related to their respective
              business activities.
            </p>

            <p className="mb-4">
              (5) Additional Information Provided By User For A Paid
              Subscription. Company may obtain User’s credit card information.
            </p>

            <p className="mb-4">
              (6) Name, etc. User permits Company to disclose User’s name and/or
              project information in a list of representative clients made
              available in Company’s marketing materials and website.
            </p>

            <p className="mb-4">
              (7) Additional Information Company May Collect During A Paid
              Subscription. During a paid subscription, Company may collect
              information from User including without limitation (a)
              device-specific information regarding User’s smartphone, tablet,
              computer or other device(s) which are used to interact with a
              Company product or service, (b) information about which Company
              product(s) or service(s) User interacts with, and User’s navigation
              among such product(s) or services, (c) the location of User’s
              device(s), (d) system configuration and information about the
              individual components of User’s system, and (e) questions or
              inquiries with customer service or technical support (collectively,
              “Services Information”).
            </p>

            <p className="mb-4">
              (8) Company shall have the right to store Services Information in
              its cloud or other storage system and to (a) share Services
              Information (in a form in which a user is not identified) with its
              authorized third party dealers, (b) perform data analyses for the
              purpose of improving Company’s products or Services or developing
              new products or services.
            </p>

            <h5 className="mb-3 text-base font-semibold text-gray-800">
              (9) Termination
            </h5>

            <p className="mb-4">
              (9.1) Company shall have the right to dissolve the Agreement if
              User is in breach of any of its obligations under this Agreement.
              Company may provide User with written notice of default and may set
              a reasonable term in which the breach may be remedied. Company
              shall never be liable for damages due to termination.
            </p>

            <p className="mb-4">
              (9.2) Upon termination of this Agreement, User shall cease any and
              all use of the services and/or products from the date of
              termination.
            </p>

            <p className="mb-4">
              (10) ProprietaryRights. The materials displayed on or contained
              within the site including, without limitation, all site software,
              design, text, editorial materials, informational text, photographs,
              illustrations, games, artwork and other graphic materials, and
              names, logos, trademarks and service marks (the "Materials"), are
              the property of Company or its licensors and are protected by
              copyright, trademark and other intellectual property laws.
            </p>

            <p className="mb-4">
              Company’s name, design and related marks are trademarks of Company,
              all rights reserved. Company hereby grants User a personal,
              non-exclusive, non-assignable and non-transferable license to use
              and display the Materials for noncommercial and personal use only.
              User agrees not to reproduce, modify, create derivative works from,
              display, perform, distribute, disseminate, broadcast or circulate
              any Materials to any third party without express prior written
              consent of Company.
            </p>

            <p className="mb-4">
              Use of Materials is only permitted with the express written
              permission of Company and/or its licensors.
            </p>

            <h5 className="mb-3 text-base font-semibold text-gray-800">
              (11) Privacy
            </h5>

            <p className="mb-4">
              (11.1) Company collects User information in an effort to improve
              User’s online experience, and to communicate with User about
              Company’s products, services and promotions. Company does not sell
              or rent User’s personal information to third parties. Company does,
              however, share User’s information with third parties that provide
              services on Company’s behalf or with whom Company has partnered to
              offer a particular product or service.
            </p>

            <p className="mb-4">
              (11.2) If Company privacy policy changes, Company shall post an
              updated version on Company’s website. The policy revision date will
              be posted at the top of the page. User may exercise User’s choices
              about how Company collects User information from time to time.
            </p>

            <p className="mb-4">
              (11.3) Company may collect information — User voluntarily submits
              to Company, for example: (i) Identifying information such as User’s
              name and email address; (ii) Security information such as User’s
              username, password, and acceptance of policies, licenses and
              warranties; (iii) Contact information such as User’s company name,
              mailing address and phone number; (iv) Billing information such as
              credit card, expiration date, billing address and account history;
              (v) Queries to Customer Service and Technical Support; (vi) site
              behavior such as pages visited, downloads, or searches requested;
              (vii) Browser information such as browser version, IP address, and
              the presence of various plug-ins and tools.
            </p>

            <p className="mb-4">
              While Company may possess social security numbers of our employees,
              consultants and contractors, Company does not collect social
              security numbers of website users.
            </p>

            <p className="mb-4">
              (11.4) Company collects information from User when User voluntarily
              submit that information to Company, including, for example:
              registering on our websites, placing an order, subscribing to
              services, participating in one of our surveys, contests or
              promotions, attending a company seminar, training session or trade
              show booth, requesting literature, or contacting Company for
              technical or customer support.
            </p>

            <p className="mb-4">
              (11.5) Company employs third party vendors, service providers and
              suppliers to perform various functions on our behalf. Third-party
              services may include, but are not limited to: customer information
              management; processing credit card or check card payments analyzing
              data; developing, hosting and maintaining our websites and
              databases. Company does not authorize any of these service
              providers to make any other use of User’s information or to contact
              User outside the context of these services.
            </p>

            <p className="mb-4">
              (11.6) Company utilizes security measures to protect the customer
              information it collects.
            </p>

            <p className="mb-4">
              (11.7) Company site may contain links to other sites. Company does
              not control the privacy practices of those websites. Company shall
              not be responsible for the content and/or practices of any linked
              websites, and Company provides these links solely for the
              convenience and information.
            </p>

            <p className="mb-4">
              (11.8) In the event of a security breach of Companies systems,
              Company agrees to notify users via their supplied email address as
              to the severity of the breach within 1 business day of the breach
              being identified.
            </p>

            <p className="mb-4">
              (11.9) At the end of the user’s subscription, Company agrees to
              destroy all user specific data by means of overwrite a minimum of
              five (5) times. The user has the option for an additional fee of
              requesting that Company freeze their account and all user specific
              data therein for an agreed upon period. At the end of that freeze
              period, the user can for an additional fee extend the freeze, if
              the user chooses not to extend the freeze then all data will be
              destroyed in accordance with the Companies data retention policy.
            </p>

            <p className="mb-4">
              (11.10) Company employs standard software logging capabilities for
              troubleshooting / auditing activities. Users may formally request
              access to log data for their own internal auditing activities,
              Company agrees to supply users with a copy of their activities for
              a fixed period (day, week). The data will be delivered in a
              standard comma separated format.
            </p>

            <h5 className="mb-3 text-base font-semibold text-gray-800">
              (12) Disclaimer of Warranties and Limitation of Liability.
            </h5>

            <p className="mb-4">
              (12.1) Warranties. User waives any and all claims it may have
              against Company arising out of the performance or non-performance
              of the services and/or products. COMPANY IS PROVIDING, AND USER
              ACCEPTS, THE SERVICES AND/OR PRODUCTS “AS-IS” WITHOUT WARRANTY OF
              ANY KIND. COMPANY DISCLAIMS ANY AND ALL REPRESENTATIONS OR
              WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING ANY
              IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR
              PURPOSE.
            </p>

            <p className="mb-4">
              COMPANY DOES NOT WARRANT THAT USE, DISPLAY OR REPRODUCTION OF THE
              SERVICES, PRODUCTS, AND/OR OTHER MATERIALS PROVIDED HEREUNDER WILL
              NOT INFRINGE ON THE INTELLECTUAL PROPERTY OR OTHER RIGHTS OF ANY
              THIRD PARTY.
            </p>

            <p className="mb-4">
              (12.2) Data Accuracy: THE COMPANY PROVIDES DATA EXTRACTION SERVICES
              AS PART OF ITS SOFTWARE APPLICATION; HENCE IT BECOMES ENTIRELY
              USER’S RESPONSIBILITY TO CHECK THE DATA FOR ITS ACCURACY BEFORE IT
              IS STORED AND THE COMPANY SHALL NOT BE LIABLE FOR ANY INACCURATE
              DATA BEING SAVED OR DAMAGES INCURRED DUE TO THAT.
            </p>

            <p className="mb-4">
              THE COMPANY PROVIDES ACESS TO THIRD PARTY SOFTWARE(TPS)
              APPLICATIONS THROUGH INTERFACE, IF FOR ANY REASON THE TPS WITHDRAWS
              ITS SUPPORT FOR THE INTERFACE PROVIDED BY THE COMPANY, THEN THE
              LOSS/DAMAGES OCCURRED TO THE USERS SHALL BE THE USERS OWN AND THE
              COMPANY SHALL NOT BE LIABLE FOR ANY SUCH LOSS OR DAMAGES.
            </p>

            <p className="mb-4">
              (12.3) Limitation of Liability. Company shall not be responsible
              for and/or liable to User and/or any third party for any loss or
              damage caused by the services and/or products or by Company’s
              performance under this Agreement.
            </p>

            <p className="mb-4">
              COMPANY SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT, SPECIAL,
              INCIDENTAL OR CONSEQUENTIAL DAMAGE, WHETHER BASED ON CONTRACT OR
              TORT OR ANY OTHER LEGAL THEORY, ARISING OUT OF ANY USE OF THE
              SOFTWARE OR ANY PERFORMANCE OF THIS AGREEMENT.
            </p>

            <p className="mb-4">
              USER AGREES THAT THESE LIMITATIONS ON WARRANTY AND LIABILITY ARE
              REASONABLE AND THAT COMPANY WOULD NOT HAVE ENTERED INTO THIS
              AGREEMENT USER’S EXPRESS AGREEMENT AS TO THE DISCLAIMERS OF WARRANTY
              AND LIMITATIONS OF COMPANY LIABILITY.
            </p>

            <p className="mb-4">
              (12.4) Indemnity by User. USER AGREES TO INDEMNIFY AND HOLD
              HARMLESS COMPANY FROM ALL LOSSES, DAMAGES, LIABILITIES, DEBTS,
              DEMANDS, CLAIMS, ACTIONS, CAUSES OF ACTION, COSTS, CHARGES AND
              EXPENSES, INCLUDING LEGAL FEES AND ANY AMOUNT PAID TO SETTLE ANY
              ACTION OR TO SATISFY A JUDGMENT.
            </p>

            <p className="mb-4">
              The rights and obligations of this Section shall survive
              termination of this Agreement.
            </p>

            <p className="mb-4">
              (13) Prohibitions. In utilizing the services and/or products
              provided by Company, User shall not, and shall not permit any
              person to directly or indirectly, unless otherwise expressly
              permitted by written agreement with Company:
            </p>

            <p className="mb-4 pl-4">
              (a) license, sublicense, sell, resell, publish, republish,
              transfer, assign, distribute, rent, lease, time-share, or otherwise
              commercially exploit the Service in any way.
            </p>

            <p className="mb-4 pl-4">
              (b) alter, modify, reverse engineer, decompile, or disassemble,
              translate or otherwise attempt to extract the source code from the
              Service or any part thereof.
            </p>

            <p className="mb-4 pl-4">
              (c) disable or circumvent any access control or related process or
              procedure established with respect to the Service.
            </p>

            <p className="mb-4 pl-4">
              (d) remove any copyright or other proprietary notices or labels on
              or in the Service or any part thereof.
            </p>

            <p className="mb-4 pl-4">
              (e) post, upload, reproduce, distribute or otherwise transmit
              unauthorized or unsolicited commercial e-mail, or other “spam” or
              any other duplicative or unsolicited messages.
            </p>

            <p className="mb-4">
              (14) Dispute Resolution. All claims, disputes or controversies
              (whether in contract or tort, or otherwise) arising out of or
              relating to:
            </p>

            <p className="mb-4 pl-4">
              (a) these terms and conditions of use;
              <br />
              (b) this site;
              <br />
              (c) any advertisement or promotion relating to these terms and
              conditions of use or this site;
              <br />
              (d) transactions effectuated through this Site, or
              <br />
              (e) the relationship which results from these terms and conditions
              of use.
            </p>

            <p className="mb-4">
              Collectively "Claims", will be referred to and determined by
              binding arbitration governed by the Federal Arbitration Act or
              under other mutually agreed procedures.
            </p>

            <p className="mb-4">
              (15) Changes to the Site. Changes may be made at any time to the
              information, names, text, images, pictures, logos trade-marks,
              products and services and any other material displayed on, offered
              through or contained on the site without notice to User.
            </p>

            <p className="mb-4">
              User shall be responsible for reviewing the website to obtain
              notice of such amendments and the latest version of this Agreement.
              If any amendment is unacceptable to User, User may terminate this
              Agreement as set out in this Agreement.
            </p>

            <p className="mb-4">
              If User continues to use the service after the effective date of
              each amendment, User shall be conclusively deemed to have accepted
              such amended version of this Agreement.
            </p>

            <p className="mb-4">
              (16) Severability. If any of the provisions of this Agreement or
              any part thereof shall be or held to be invalid or unenforceable,
              such invalidity or unenforceability shall not invalidate or render
              unenforceable the entire Agreement.
            </p>

            <p className="mb-4">
              (17) Entire Agreement. This Agreement contains the entire
              understanding and agreement of the parties relating to its subject
              matter. Any representation, promise or condition not explicitly set
              forth in this Agreement shall not be binding on either party.
            </p>

            <p className="mb-4">
              (18) Notice. Notices shall be in writing and sent via overnight
              courier, confirmed facsimile or confirmed electronic mail to
              Company at the contact addresses provided below.
            </p>

            <p className="mb-4">
              (20) Attorney’s Fees. Should Company employ counsel or incur any
              costs in enforce any rights arising out of or relating to this
              Agreement, it shall be entitled to recover such reasonable costs
              and legal fees related to such enforcement.
            </p>

            <p className="mb-4">
              (21) Acknowledgment. User hereby accepts the terms of this
              Agreement and acknowledges the terms herein. By obtaining a paid
              subscription, User acknowledges that User has read, understands
              and agrees to all of the terms, conditions, obligations and
              limitations of this Agreement.
            </p>

            <p>
              Copyright content on this site is provided by Digital Documentation
              Systems Pvt. Ltd. and may not be reproduced without the express
              written permission of Digital Documentation Systems Pvt. Ltd.'s
              principal. Please email your request to: info@digitaldocsys.in
            </p>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
};


